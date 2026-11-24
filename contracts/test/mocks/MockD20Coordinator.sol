// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ID20VRFConsumer, ID20VRFRefundConsumer} from "@d20dao/vrf-sdk/contracts/interfaces/ID20VRF.sol";
import {RandomnessMapping} from "@d20dao/vrf-sdk/contracts/libraries/RandomnessMapping.sol";

/// @dev Test-only stand-in for the D20DAO coordinator. Mirrors the semantics FairSlot relies on:
///      contract-only requests, exact fee, 60 second deadline, fulfil/retry/refund state flags.
contract MockD20Coordinator {
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

    uint256 public nextRequestId = 1;
    uint256 public fee = 0.02 ether;
    /// @dev When non-zero, the first delivery uses this gas instead of the request's limit (simulates a failing callback).
    uint32 public forcedFirstDeliveryGas;
    mapping(uint256 => Request) private reqs;

    function setNextRequestId(uint256 id) external {
        nextRequestId = id;
    }

    function setForcedFirstDeliveryGas(uint32 gasLimit) external {
        forcedFirstDeliveryGas = gasLimit;
    }

    function setFee(uint256 newFee) external {
        fee = newFee;
    }

    function quoteFee(uint32) external view returns (uint256) {
        return fee;
    }

    function quoteFeeAt(uint32, uint256) external view returns (uint256) {
        return fee;
    }

    function requestRandomness(bytes32 clientSeed, uint32 callbackGasLimit, address refundAddress)
        external
        payable
        returns (uint256 id)
    {
        require(msg.sender.code.length > 0, "ContractConsumerRequired");
        require(msg.value >= fee, "IncorrectFee");
        require(refundAddress != address(0), "InvalidRefundAddress");
        id = nextRequestId++;
        Request storage r = reqs[id];
        r.consumer = msg.sender;
        r.callbackGasLimit = callbackGasLimit;
        r.requestBlock = uint64(block.number);
        r.deadline = uint64(block.timestamp + 60);
        r.refundAddress = refundAddress;
        r.clientSeed = clientSeed;
    }

    function getRequest(uint256 id) external view returns (Request memory) {
        require(reqs[id].consumer != address(0), "UnknownRequest");
        return reqs[id];
    }

    /// @dev Accept a proof. The callback runs with the stored gas limit; a failing callback leaves delivered=false.
    function fulfill(uint256 id, bytes32 word) external returns (bool ok) {
        Request storage r = reqs[id];
        require(!r.fulfilled, "AlreadyFulfilled");
        require(!r.refunded, "RequestRefunded");
        require(block.timestamp <= r.deadline, "RequestExpired");
        r.fulfilled = true;
        r.randomness = word;
        ok = _deliver(id, forcedFirstDeliveryGas != 0 ? forcedFirstDeliveryGas : r.callbackGasLimit);
        r.delivered = ok;
    }

    function retryCallback(uint256 id, uint32 gasLimit) external {
        Request storage r = reqs[id];
        require(r.fulfilled, "NotFulfilled");
        require(!r.delivered, "AlreadyDelivered");
        r.delivered = _deliver(id, gasLimit);
    }

    function refundRequest(uint256 id) external {
        Request storage r = reqs[id];
        require(!r.fulfilled && !r.refunded && block.timestamp > r.deadline, "RefundNotAvailable");
        r.refunded = true;
        (bool sent,) = r.refundAddress.call{value: fee, gas: 30_000}("");
        sent;
        ID20VRFRefundConsumer(r.consumer).onRefund(id);
    }

    function _deliver(uint256 id, uint32 gasLimit) private returns (bool ok) {
        Request storage r = reqs[id];
        (ok,) = r.consumer.call{gas: gasLimit}(abi.encodeCall(ID20VRFConsumer.rawFulfillRandomness, (id, r.randomness)));
    }

    receive() external payable {}
}
