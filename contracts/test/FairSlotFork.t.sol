// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {FairSlot, IFairSlotRequestReader} from "../FairSlot.sol";

/// @dev Runs against a LOCAL FORK of the real D20DAO coordinator (read-only: no transaction is sent to any live
///      network). Run with: forge test --match-contract FairSlotForkTest --fork-url https://rpc.mainnet.arc.io
///      (or the testnet RPC with chain id 5042002). Without a fork these tests return immediately.
///      Proof acceptance needs the provider's key, so it cannot be driven here; the unit tests cover that path with a
///      mock. What this proves against the REAL coordinator: ABI compatibility, exact in-transaction fee, request
///      binding, deadline semantics, and the expiry / refund recovery path.
contract FairSlotForkTest is Test {
    address constant MAINNET_COORDINATOR = 0xd20da057469C45928912d983F45790C41e290571;
    address constant TESTNET_COORDINATOR = 0xd20DA0FF9087d053f0291524Eac12abA1ADBd945;

    address organizer = address(0xABCD);
    FairSlot fs;
    IFairSlotRequestReader coordinator;

    function _forked() internal view returns (bool) {
        return block.chainid == 5042 || block.chainid == 5042002;
    }

    function setUp() public {
        if (!_forked()) return;
        address c = block.chainid == 5042 ? MAINNET_COORDINATOR : TESTNET_COORDINATOR;
        coordinator = IFairSlotRequestReader(c);
        // Set FAIRSLOT_FORK_ADDRESS to run the same checks against an already deployed FairSlot.
        address deployed = vm.envOr("FAIRSLOT_FORK_ADDRESS", address(0));
        fs = deployed == address(0) ? new FairSlot(c) : FairSlot(deployed);
        assertEq(fs.vrfCoordinator(), c, "FairSlot points at the expected coordinator");
        vm.deal(organizer, 10 ether);
    }

    function _commitAndRequest() internal returns (bytes32 id, uint256 requestId, uint256 fee) {
        vm.startPrank(organizer);
        id = fs.commitEvent(keccak256("fork-event"), keccak256("manifest"), "https://example.org/m.json", 100, 3, 2, 1, 0, organizer);
        fee = fs.quoteFeeAt(block.basefee);
        uint256 before = organizer.balance;
        requestId = fs.requestDraw{value: fee * 2}(id); // send double: the surplus must come straight back
        vm.stopPrank();
        assertEq(before - organizer.balance, _exactFee(), "only the exact fee is spent");
        assertEq(address(fs).balance, 0, "contract holds nothing");
    }

    function _exactFee() internal view returns (uint256) {
        // The coordinator quotes with the base fee of the requesting transaction.
        return fs.quoteFeeAt(block.basefee);
    }

    function test_fork_requestIsBoundToTheEventAndFeeIsExact() public {
        if (!_forked()) return;
        (bytes32 id, uint256 requestId,) = _commitAndRequest();

        IFairSlotRequestReader.Request memory r = coordinator.getRequest(requestId);
        assertEq(r.consumer, address(fs));
        assertEq(r.refundAddress, organizer);
        assertEq(r.callbackGasLimit, fs.CALLBACK_GAS());
        assertFalse(r.fulfilled);
        assertFalse(r.refunded);
        assertEq(uint256(r.deadline), block.timestamp + 60);
        assertEq(
            r.clientSeed, keccak256(abi.encode(fs.SEED_DOMAIN(), block.chainid, address(fs), id, keccak256("manifest")))
        );
        assertEq(fs.eventOfRequest(requestId), id);
        assertEq(uint8(fs.getEvent(id).state), uint8(FairSlot.State.RANDOMNESS_REQUESTED));
    }

    function test_fork_expiredRequestRefundsOrganizerAndFailsEvent() public {
        if (!_forked()) return;
        (bytes32 id, uint256 requestId,) = _commitAndRequest();

        vm.expectRevert(FairSlot.RequestStillPending.selector);
        fs.markFailed(id);

        vm.warp(block.timestamp + 61);
        uint256 before = organizer.balance;
        // anyone can trigger the refund; D20DAO recommends 400,000 gas for this call
        (bool ok,) = address(coordinator).call{gas: 400_000}(abi.encodeWithSignature("refundRequest(uint256)", requestId));
        assertTrue(ok, "refundRequest");

        assertGt(organizer.balance, before, "refund reaches the fixed recipient");
        assertEq(uint8(fs.getEvent(id).state), uint8(FairSlot.State.FAILED), "onRefund hook closed the event");
        assertTrue(coordinator.getRequest(requestId).refunded);
    }

    function test_fork_markFailedWithoutRefund() public {
        if (!_forked()) return;
        (bytes32 id,,) = _commitAndRequest();
        vm.warp(block.timestamp + 61);
        fs.markFailed(id);
        assertEq(uint8(fs.getEvent(id).state), uint8(FairSlot.State.FAILED));
    }

    function test_fork_underpaidFeeReverts() public {
        if (!_forked()) return;
        vm.startPrank(organizer);
        bytes32 id = fs.commitEvent(keccak256("fork-event-2"), keccak256("manifest"), "u", 10, 1, 0, 1, 0, organizer);
        uint256 fee = fs.quoteFeeAt(block.basefee);
        vm.expectRevert(abi.encodeWithSelector(FairSlot.InsufficientFee.selector, fee, fee - 1));
        fs.requestDraw{value: fee - 1}(id);
        vm.stopPrank();
    }
}
