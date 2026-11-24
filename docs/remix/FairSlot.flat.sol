// SPDX-License-Identifier: MIT
pragma solidity =0.8.28 ^0.8.20;

// node_modules/@d20dao/vrf-sdk/contracts/libraries/RandomnessMapping.sol

/// @notice Version 1 deterministic, unbiased range sampling and bounded game operations.
/// @dev Choice/shuffle outputs are indices. Consumers must lock their item list before requesting.
library RandomnessMapping {
    enum Operation { Raw, DiceRoll, CoinFlip, NumberRange, ChooseOne, ChooseMany, Shuffle }
    struct Spec {
        Operation operation;
        uint256 lower;
        uint256 upper;
        uint32 count;
        uint32 population;
    }
    struct Stream { bytes32 randomness; uint256 cursor; }
    bytes32 internal constant MAP_DOMAIN = keccak256("D20_MAP");
    uint32 internal constant MAX_ITEMS = 256;
    uint32 internal constant MAX_DICE = 128;
    error InvalidMapping();

    function validate(Spec memory s) internal pure {
        if (s.operation == Operation.Raw) {
            if (s.lower != 0 || s.upper != 0 || s.count != 0 || s.population != 0) revert InvalidMapping();
        } else if (s.operation == Operation.DiceRoll) {
            if (s.lower != 0 || s.upper < 2 || s.count == 0 || s.count > MAX_DICE || s.population != 0)
                revert InvalidMapping();
        } else if (s.operation == Operation.CoinFlip) {
            if (s.lower != 0 || s.upper != 0 || s.count != 1 || s.population != 0) revert InvalidMapping();
        } else if (s.operation == Operation.NumberRange) {
            if (s.lower > s.upper || s.count != 1 || s.population != 0) revert InvalidMapping();
        } else {
            if (s.lower != 0 || s.upper != 0 || s.population == 0 || s.population > MAX_ITEMS)
                revert InvalidMapping();
            if (s.operation == Operation.ChooseOne && s.count != 1) revert InvalidMapping();
            if (s.operation == Operation.ChooseMany && (s.count == 0 || s.count > s.population))
                revert InvalidMapping();
            if (s.operation == Operation.Shuffle && s.count != s.population) revert InvalidMapping();
        }
    }

    function hash(Spec memory s) internal pure returns (bytes32) {
        return keccak256(abi.encode(s.operation, s.lower, s.upper, s.count, s.population));
    }

    function map(bytes32 randomness, Spec memory s) internal pure returns (uint256[] memory result) {
        validate(s);
        Stream memory stream = Stream(randomness, 0);
        if (s.operation == Operation.Raw) {
            result = new uint256[](1);
            result[0] = uint256(randomness);
        } else if (s.operation == Operation.DiceRoll) {
            result = new uint256[](s.count);
            for (uint256 i; i < s.count; ++i) result[i] = sample(stream, s.upper) + 1;
        } else if (s.operation == Operation.CoinFlip) {
            result = new uint256[](1);
            result[0] = sample(stream, 2); // 0 = tails, 1 = heads.
        } else if (s.operation == Operation.NumberRange) {
            result = new uint256[](1);
            result[0] = s.lower == 0 && s.upper == type(uint256).max
                ? next(stream) : s.lower + sample(stream, s.upper - s.lower + 1);
        } else if (s.operation == Operation.ChooseOne) {
            result = new uint256[](1);
            result[0] = sample(stream, s.population);
        } else {
            // Partial Fisher-Yates: without-replacement choices, or a full permutation.
            uint256[] memory pool = new uint256[](s.population);
            for (uint256 i; i < s.population; ++i) pool[i] = i;
            result = new uint256[](s.count);
            for (uint256 i; i < s.count; ++i) {
                uint256 j = i + sample(stream, s.population - i);
                (pool[i], pool[j]) = (pool[j], pool[i]);
                result[i] = pool[i];
            }
        }
    }

    function next(Stream memory stream) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(MAP_DOMAIN, stream.randomness, stream.cursor++)));
    }

    /// @dev Reject the short residue prefix instead of introducing modulo bias.
    function sample(Stream memory stream, uint256 bound) internal pure returns (uint256) {
        uint256 threshold;
        unchecked { threshold = (0 - bound) % bound; }
        uint256 word;
        do { word = next(stream); } while (word < threshold);
        return word % bound;
    }
}

// node_modules/@openzeppelin/contracts/utils/StorageSlot.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/StorageSlot.sol)
// This file was procedurally generated from scripts/generate/templates/StorageSlot.js.

/**
 * @dev Library for reading and writing primitive types to specific storage slots.
 *
 * Storage slots are often used to avoid storage conflict when dealing with upgradeable contracts.
 * This library helps with reading and writing to such slots without the need for inline assembly.
 *
 * The functions in this library return Slot structs that contain a `value` member that can be used to read or write.
 *
 * Example usage to set ERC-1967 implementation slot:
 * ```solidity
 * contract ERC1967 {
 *     // Define the slot. Alternatively, use the SlotDerivation library to derive the slot.
 *     bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
 *
 *     function _getImplementation() internal view returns (address) {
 *         return StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value;
 *     }
 *
 *     function _setImplementation(address newImplementation) internal {
 *         require(newImplementation.code.length > 0);
 *         StorageSlot.getAddressSlot(_IMPLEMENTATION_SLOT).value = newImplementation;
 *     }
 * }
 * ```
 *
 * TIP: Consider using this library along with {SlotDerivation}.
 */
library StorageSlot {
    struct AddressSlot {
        address value;
    }

    struct BooleanSlot {
        bool value;
    }

    struct Bytes32Slot {
        bytes32 value;
    }

    struct Uint256Slot {
        uint256 value;
    }

    struct Int256Slot {
        int256 value;
    }

    struct StringSlot {
        string value;
    }

    struct BytesSlot {
        bytes value;
    }

    /**
     * @dev Returns an `AddressSlot` with member `value` located at `slot`.
     */
    function getAddressSlot(bytes32 slot) internal pure returns (AddressSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `BooleanSlot` with member `value` located at `slot`.
     */
    function getBooleanSlot(bytes32 slot) internal pure returns (BooleanSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Bytes32Slot` with member `value` located at `slot`.
     */
    function getBytes32Slot(bytes32 slot) internal pure returns (Bytes32Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Uint256Slot` with member `value` located at `slot`.
     */
    function getUint256Slot(bytes32 slot) internal pure returns (Uint256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `Int256Slot` with member `value` located at `slot`.
     */
    function getInt256Slot(bytes32 slot) internal pure returns (Int256Slot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns a `StringSlot` with member `value` located at `slot`.
     */
    function getStringSlot(bytes32 slot) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `StringSlot` representation of the string storage pointer `store`.
     */
    function getStringSlot(string storage store) internal pure returns (StringSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }

    /**
     * @dev Returns a `BytesSlot` with member `value` located at `slot`.
     */
    function getBytesSlot(bytes32 slot) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := slot
        }
    }

    /**
     * @dev Returns an `BytesSlot` representation of the bytes storage pointer `store`.
     */
    function getBytesSlot(bytes storage store) internal pure returns (BytesSlot storage r) {
        assembly ("memory-safe") {
            r.slot := store.slot
        }
    }
}

// node_modules/@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol

interface ID20VRF {
    /// @notice Exact fee for a request sent in this same transaction. Through eth_call the base fee is often reported as 0,
    ///         so off-chain senders must quote with quoteFeeAt and the latest header baseFeePerGas plus a buffer.
    function quoteFee(uint32 callbackGasLimit) external view returns (uint256);
    /// @notice max(minFee, feeMultiplier * baseFee * (fulfillGasOverhead + callbackGasLimit)) over the current parameters.
    function quoteFeeAt(uint32 callbackGasLimit, uint256 baseFee) external view returns (uint256);
    function requestRandomness(bytes32 clientSeed, uint32 callbackGasLimit, address _refundAddress)
        external payable returns (uint256 requestId);
    function requestMappedRandomness(
        bytes32 clientSeed, uint32 callbackGasLimit, address _refundAddress, RandomnessMapping.Spec calldata spec
    ) external payable returns (uint256 requestId);
    function getMappedResult(uint256 requestId) external view returns (uint256[] memory);
}

interface ID20VRFConsumer {
    function rawFulfillRandomness(uint256 requestId, bytes32 randomness) external;
}

/// @notice Optional notification after the RNG fee was refunded or recorded as backed credit.
interface ID20VRFRefundConsumer {
    function onRefund(uint256 requestId) external;
}

// node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v5.5.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 *
 * IMPORTANT: Deprecated. This storage-based reentrancy guard will be removed and replaced
 * by the {ReentrancyGuardTransient} variant in v6.0.
 *
 * @custom:stateless
 */
abstract contract ReentrancyGuard {
    using StorageSlot for bytes32;

    // keccak256(abi.encode(uint256(keccak256("openzeppelin.storage.ReentrancyGuard")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant REENTRANCY_GUARD_STORAGE =
        0x9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f00;

    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    /**
     * @dev A `view` only version of {nonReentrant}. Use to block view functions
     * from being called, preventing reading from inconsistent contract state.
     *
     * CAUTION: This is a "view" modifier and does not change the reentrancy
     * status. Use it only on view functions. For payable or non-payable functions,
     * use the standard {nonReentrant} modifier instead.
     */
    modifier nonReentrantView() {
        _nonReentrantBeforeView();
        _;
    }

    function _nonReentrantBeforeView() private view {
        if (_reentrancyGuardEntered()) {
            revert ReentrancyGuardReentrantCall();
        }
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        _nonReentrantBeforeView();

        // Any calls to nonReentrant after this point will fail
        _reentrancyGuardStorageSlot().getUint256Slot().value = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _reentrancyGuardStorageSlot().getUint256Slot().value = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _reentrancyGuardStorageSlot().getUint256Slot().value == ENTERED;
    }

    function _reentrancyGuardStorageSlot() internal pure virtual returns (bytes32) {
        return REENTRANCY_GUARD_STORAGE;
    }
}

// node_modules/@d20dao/vrf-sdk/contracts/D20VRFConsumer.sol

/// @notice Every consumer must authenticate callbacks before changing application state.
abstract contract D20VRFConsumer is ID20VRFConsumer, ID20VRFRefundConsumer {
    address public immutable vrfCoordinator;
    error OnlyCoordinator();
    error InvalidCoordinator();

    constructor(address coordinator) {
        if (coordinator.code.length == 0) revert InvalidCoordinator();
        vrfCoordinator = coordinator;
    }

    function rawFulfillRandomness(uint256 requestId, bytes32 randomness) external {
        if (msg.sender != vrfCoordinator) revert OnlyCoordinator();
        _fulfillRandomness(requestId, randomness);
    }

    function onRefund(uint256 requestId) external {
        if (msg.sender != vrfCoordinator) revert OnlyCoordinator();
        _onRefund(requestId);
    }

    /// @dev Optional lifecycle notification. Funds may be paid to a different refundAddress
    ///      or held as credit. Correlate the request and handle application refunds separately.
    function _onRefund(uint256 requestId) internal virtual {}

    /// @dev Store randomness only. Keep minting and transfers out of the callback.
    function _fulfillRandomness(uint256 requestId, bytes32 randomness) internal virtual;
}

// contracts/FairSlot.sol

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
