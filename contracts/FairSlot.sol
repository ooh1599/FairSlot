// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {D20VRFConsumer} from "@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Read-only view of the coordinator's public Request struct (field order must match the deployed ABI).
interface IFairSlotRequestReader {
    struct Request {
        address consumer;
        uint32 callbackGasLimit;
        uint64 requestBlock;
        uint64 targetBlock;
        uint64 deadline;
        address refundAddress;
        bytes32 clientSeed;
        bytes32 mappingHash;
        bytes32 blockHash;
        bytes32 randomness;
        bytes32 proofHash;
        bytes32 transcriptHash;
        bool fulfilled;
        bool delivered;
        bool refunded;
        uint64 epochId;
        bytes32 epochHash;
    }

    function getRequest(uint256 requestId) external view returns (Request memory);
}

/// @title FairSlot
/// @notice Commit-then-draw winner selection. An organizer commits a frozen participant manifest, asks the
///         D20DAO coordinator for ONE random word, and anyone can finalize the winners from that word.
///         Non-upgradeable, no admin, no function lets any party write or change winners.
/// @dev Winners are chosen with a partial Fisher-Yates shuffle over a sparse swap map. Each draw position expands
///      the single random word with keccak256 under a domain that binds chain, contract, event, manifest, request,
///      word and algorithm version; rejection sampling removes modulo bias. See docs/algorithm.md.
contract FairSlot is D20VRFConsumer, ReentrancyGuard {
    // ---------------------------------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------------------------------

    enum State {
        NONE,
        COMMITTED,
        RANDOMNESS_REQUESTED,
        RANDOMNESS_RECEIVED,
        FINALIZING,
        FINALIZED,
        CANCELLED,
        FAILED
    }

    struct EventData {
        address organizer; // immutable once committed
        State state;
        uint8 winnerCount;
        uint8 reserveCount;
        uint8 algorithmVersion;
        uint16 participantCount;
        uint8 drawn; // number of draw positions already written
        uint64 committedAt;
        uint64 drawNotBefore;
        uint64 requestedAt;
        address refundRecipient; // fixed at commit, used as the coordinator refund address
        bytes32 publicEventId;
        bytes32 manifestHash;
        uint256 requestId;
        bytes32 randomWord;
    }

    // ---------------------------------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------------------------------

    uint8 public constant ALGORITHM_VERSION = 1;
    uint256 public constant MAX_PARTICIPANTS = 10_000;
    uint256 public constant MAX_PICKS = 50; // winners + reserves
    uint256 public constant MAX_FINALIZE_BATCH = 25;
    uint256 public constant MAX_MANIFEST_URI_BYTES = 512;
    uint256 public constant MAX_DRAW_DELAY = 365 days;
    /// @dev Callback only stores one word and a state flag; 150k leaves wide headroom (measured in tests).
    uint32 public constant CALLBACK_GAS = 150_000;

    bytes32 public constant DRAW_DOMAIN = keccak256("FairSlot/draw/v1");
    bytes32 public constant SEED_DOMAIN = keccak256("FairSlot/clientSeed/v1");

    // ---------------------------------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------------------------------

    ID20VRF public immutable rng;

    mapping(bytes32 eventId => EventData) private _events;
    mapping(bytes32 eventId => string) private _manifestURIs;
    mapping(uint256 requestId => bytes32 eventId) public eventOfRequest;
    mapping(bytes32 eventId => uint32[]) private _winners;
    /// @dev sparse Fisher-Yates swap map: stores (value + 1) so that 0 means "untouched".
    mapping(bytes32 eventId => mapping(uint256 index => uint32 valuePlusOne)) private _swaps;

    // ---------------------------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------------------------

    event EventCommitted(
        bytes32 indexed eventId,
        address indexed organizer,
        bytes32 indexed publicEventId,
        bytes32 manifestHash,
        string manifestURI,
        uint16 participantCount,
        uint8 winnerCount,
        uint8 reserveCount,
        uint8 algorithmVersion,
        uint64 drawNotBefore,
        address refundRecipient,
        uint64 committedAt
    );
    event EventCancelled(bytes32 indexed eventId, address indexed organizer);
    event DrawRequested(
        bytes32 indexed eventId, uint256 indexed requestId, bytes32 clientSeed, uint256 feePaid, address refundRecipient
    );
    event RandomnessReceived(bytes32 indexed eventId, uint256 indexed requestId, bytes32 randomWord);
    event WinnersDrawn(bytes32 indexed eventId, uint256 fromPosition, uint32[] indices);
    event EventFinalized(bytes32 indexed eventId, uint8 winnerCount, uint8 reserveCount);
    event EventFailed(bytes32 indexed eventId, uint256 indexed requestId, uint8 reason); // 1 expired, 2 refunded

    // ---------------------------------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------------------------------

    error InvalidParameters();
    error ManifestUriTooLong();
    error EventAlreadyExists();
    error UnknownEvent();
    error NotOrganizer();
    error WrongState(State current);
    error DrawNotOpenYet(uint64 opensAt);
    error InsufficientFee(uint256 required, uint256 provided);
    error ChangeTransferFailed();
    error UnknownRequest();
    error RequestStillPending();
    error RandomnessAlreadyAccepted();
    error InvalidBatchSize();

    constructor(address coordinator) D20VRFConsumer(coordinator) {
        rng = ID20VRF(coordinator);
    }

    // ---------------------------------------------------------------------------------------------
    // Commit / cancel
    // ---------------------------------------------------------------------------------------------

    /// @notice Lock an event. Participants, prize assignments and rules live in the manifest whose hash is stored here.
    function commitEvent(
        bytes32 publicEventId,
        bytes32 manifestHash,
        string calldata uri,
        uint16 participantCount,
        uint8 winnerCount,
        uint8 reserveCount,
        uint8 algorithmVersion,
        uint64 drawNotBefore,
        address refundRecipient
    ) external returns (bytes32 eventId) {
        if (
            publicEventId == bytes32(0) || manifestHash == bytes32(0) || refundRecipient == address(0)
                || algorithmVersion != ALGORITHM_VERSION || winnerCount == 0 || participantCount == 0
                || participantCount > MAX_PARTICIPANTS || uint256(winnerCount) + reserveCount > MAX_PICKS
                || uint256(winnerCount) + reserveCount > participantCount
                || drawNotBefore > block.timestamp + MAX_DRAW_DELAY
        ) revert InvalidParameters();
        if (bytes(uri).length == 0 || bytes(uri).length > MAX_MANIFEST_URI_BYTES) {
            revert ManifestUriTooLong();
        }

        eventId = eventIdFor(msg.sender, publicEventId);
        EventData storage e = _events[eventId];
        if (e.state != State.NONE) revert EventAlreadyExists();

        e.organizer = msg.sender;
        e.state = State.COMMITTED;
        e.winnerCount = winnerCount;
        e.reserveCount = reserveCount;
        e.algorithmVersion = algorithmVersion;
        e.participantCount = participantCount;
        e.committedAt = uint64(block.timestamp);
        e.drawNotBefore = drawNotBefore;
        e.refundRecipient = refundRecipient;
        e.publicEventId = publicEventId;
        e.manifestHash = manifestHash;
        _manifestURIs[eventId] = uri;

        emit EventCommitted(
            eventId,
            msg.sender,
            publicEventId,
            manifestHash,
            uri,
            participantCount,
            winnerCount,
            reserveCount,
            algorithmVersion,
            drawNotBefore,
            refundRecipient,
            uint64(block.timestamp)
        );
    }

    /// @notice Cancel before randomness is requested. Impossible afterwards, so a result cannot be dodged.
    function cancelEvent(bytes32 eventId) external {
        EventData storage e = _event(eventId);
        if (msg.sender != e.organizer) revert NotOrganizer();
        if (e.state != State.COMMITTED) revert WrongState(e.state);
        e.state = State.CANCELLED;
        emit EventCancelled(eventId, msg.sender);
    }

    // ---------------------------------------------------------------------------------------------
    // Randomness request
    // ---------------------------------------------------------------------------------------------

    /// @notice Ask the coordinator for one random word. Pays the exact coordinator fee quoted in this
    ///         transaction and returns any extra value to the organizer in the same call.
    function requestDraw(bytes32 eventId) external payable nonReentrant returns (uint256 requestId) {
        EventData storage e = _event(eventId);
        if (msg.sender != e.organizer) revert NotOrganizer();
        if (e.state != State.COMMITTED) revert WrongState(e.state);
        if (block.timestamp < e.drawNotBefore) revert DrawNotOpenYet(e.drawNotBefore);

        uint256 fee = rng.quoteFee(CALLBACK_GAS);
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);

        // Effects first: from here the event can no longer be cancelled or changed.
        e.state = State.RANDOMNESS_REQUESTED;
        e.requestedAt = uint64(block.timestamp);

        bytes32 clientSeed = keccak256(abi.encode(SEED_DOMAIN, block.chainid, address(this), eventId, e.manifestHash));
        requestId = rng.requestRandomness{value: fee}(clientSeed, CALLBACK_GAS, e.refundRecipient);
        e.requestId = requestId;
        eventOfRequest[requestId] = eventId;

        emit DrawRequested(eventId, requestId, clientSeed, fee, e.refundRecipient);

        uint256 change = msg.value - fee;
        if (change != 0) {
            (bool ok,) = msg.sender.call{value: change}("");
            if (!ok) revert ChangeTransferFailed();
        }
    }

    /// @dev Coordinator callback. Stores the word and flips the state. Nothing else.
    function _fulfillRandomness(uint256 requestId, bytes32 randomness) internal override {
        bytes32 eventId = eventOfRequest[requestId];
        if (eventId == bytes32(0)) revert UnknownRequest();
        EventData storage e = _events[eventId];
        if (e.state != State.RANDOMNESS_REQUESTED || e.requestId != requestId) revert RandomnessAlreadyAccepted();
        e.randomWord = randomness;
        e.state = State.RANDOMNESS_RECEIVED;
        emit RandomnessReceived(eventId, requestId, randomness);
    }

    /// @dev Coordinator refund notification. A refund is only possible for an unfulfilled, expired request.
    function _onRefund(uint256 requestId) internal override {
        bytes32 eventId = eventOfRequest[requestId];
        if (eventId == bytes32(0)) return;
        EventData storage e = _events[eventId];
        if (e.state == State.RANDOMNESS_REQUESTED && e.requestId == requestId) {
            e.state = State.FAILED;
            emit EventFailed(eventId, requestId, 2);
        }
    }

    /// @notice Permissionless: mark the event FAILED when the provider never produced an accepted proof in time.
    ///         Reverts while a proof was accepted (even if its callback failed: retry delivery instead).
    function markFailed(bytes32 eventId) external {
        EventData storage e = _event(eventId);
        if (e.state != State.RANDOMNESS_REQUESTED) revert WrongState(e.state);
        IFairSlotRequestReader.Request memory r = IFairSlotRequestReader(vrfCoordinator).getRequest(e.requestId);
        if (r.fulfilled) revert RequestStillPending(); // accepted proof: deliver the same word via retryCallback
        if (!r.refunded && block.timestamp <= r.deadline) revert RequestStillPending();
        e.state = State.FAILED;
        emit EventFailed(eventId, e.requestId, r.refunded ? 2 : 1);
    }

    // ---------------------------------------------------------------------------------------------
    // Finalize (permissionless, bounded batches)
    // ---------------------------------------------------------------------------------------------

    /// @notice Draw up to `maxPositions` further positions. Any caller, any batch size from 1 to 25: the result
    ///         never depends on how the work is split.
    function finalize(bytes32 eventId, uint8 maxPositions) external {
        EventData storage e = _event(eventId);
        State s = e.state;
        if (s != State.RANDOMNESS_RECEIVED && s != State.FINALIZING) revert WrongState(s);
        if (maxPositions == 0 || maxPositions > MAX_FINALIZE_BATCH) revert InvalidBatchSize();

        uint256 total = uint256(e.winnerCount) + e.reserveCount;
        uint256 from = e.drawn;
        uint256 end = from + maxPositions;
        if (end > total) end = total;

        bytes32 base = _drawBase(eventId, e);
        uint256 n = e.participantCount;
        uint32[] memory batch = new uint32[](end - from);
        uint32[] storage out = _winners[eventId];
        mapping(uint256 => uint32) storage swaps = _swaps[eventId];

        for (uint256 p = from; p < end; ++p) {
            uint256 j;
            // Safe without checks: p < total <= n <= MAX_PARTICIPANTS, so n - p cannot underflow, and
            // _uniform(base, p, n - p) < n - p, so j = p + r < n and cannot overflow.
            unchecked {
                j = p + _uniform(base, p, n - p);
            }
            uint32 vp = swaps[p];
            uint32 valueP = vp == 0 ? uint32(p) : vp - 1;
            uint32 vj = swaps[j];
            uint32 valueJ = vj == 0 ? uint32(j) : vj - 1;
            if (j != p) swaps[j] = valueP + 1;
            out.push(valueJ);
            batch[p - from] = valueJ;
        }

        e.drawn = uint8(end);
        emit WinnersDrawn(eventId, from, batch);
        if (end == total) {
            e.state = State.FINALIZED;
            emit EventFinalized(eventId, e.winnerCount, e.reserveCount);
        } else {
            e.state = State.FINALIZING;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function eventIdFor(address organizer, bytes32 publicEventId) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), organizer, publicEventId));
    }

    function getEvent(bytes32 eventId) external view returns (EventData memory) {
        return _events[eventId];
    }

    function manifestURI(bytes32 eventId) external view returns (string memory) {
        return _manifestURIs[eventId];
    }

    /// @notice Draw order: first `winnerCount` entries are main winners, the next `reserveCount` are reserves.
    ///         Values are zero-based indices into the manifest's ordered entry list.
    function getWinners(bytes32 eventId) external view returns (uint32[] memory) {
        return _winners[eventId];
    }

    /// @notice Coordinator fee for a request made in a transaction with the given base fee (native USDC, 18 decimals).
    function quoteFeeAt(uint256 baseFee) external view returns (uint256) {
        return rng.quoteFeeAt(CALLBACK_GAS, baseFee);
    }

    /// @notice Pure helper used by verifiers: the per-event hash that seeds every draw position.
    function drawBase(
        uint256 chainId,
        address self,
        bytes32 eventId,
        bytes32 manifestHash,
        uint256 requestId,
        bytes32 randomWord,
        uint8 algorithmVersion
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(DRAW_DOMAIN, chainId, self, eventId, manifestHash, requestId, randomWord, algorithmVersion)
        );
    }

    /// @notice Pure helper used by verifiers: uniform value in [0, range) for one draw position.
    function uniformAt(bytes32 base, uint256 position, uint256 range) external pure returns (uint256) {
        return _uniform(base, position, range);
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _event(bytes32 eventId) private view returns (EventData storage e) {
        e = _events[eventId];
        if (e.state == State.NONE) revert UnknownEvent();
    }

    function _drawBase(bytes32 eventId, EventData storage e) private view returns (bytes32) {
        return drawBase(
            block.chainid, address(this), eventId, e.manifestHash, e.requestId, e.randomWord, e.algorithmVersion
        );
    }

    /// @dev Rejection sampling over keccak256(base, position, counter). range >= 1.
    function _uniform(bytes32 base, uint256 position, uint256 range) internal pure returns (uint256 result) {
        if (range == 1) return 0;
        // 2^256 mod range. Values above (2^256 - 1 - rem) would bias the modulo and are rejected.
        uint256 rem = (type(uint256).max % range + 1) % range;
        uint256 limit = type(uint256).max - rem;
        for (uint256 counter = 0;; ++counter) {
            uint256 h = uint256(keccak256(abi.encode(base, uint32(position), uint32(counter))));
            if (h <= limit) {
                result = h % range;
                break;
            }
        }
        // the loop ends on the first accepted candidate: acceptance probability per round is at least 1/2
    }
}
