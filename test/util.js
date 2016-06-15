var fs = require('fs');
var assert = require('assert');
var _ = require('lodash');
var solc = require('solc');

function compile(dir, files) {
  var input = _(files)
    .map(function(file) {
      return [file, fs.readFileSync(dir + '/' + file).toString()];
    })
    .fromPairs()
    .value();
  return solc.compile({ sources: input }, 1, function findImports(path) {
    try {
      return { contents: fs.readFileSync(dir + '/' + path).toString() };
    } catch (e) {
      return { error: e };
    }
  });
}

function waitForReceipt(web3, txHash, cb) {
  var called = false;
  var blockFilter = web3.eth.filter('latest');
  blockFilter.watch(function() {
    web3.eth.getTransactionReceipt(txHash, function(err, receipt) {
      if (err) return cb(err);
      if (receipt) {
        if (called) return; // protection agains double calling
        called = true;
        blockFilter.stopWatching();
        cb(null, receipt);
      }
    });
  });
}

function attempt_proposal(
  web3,
  argdao,
  recipient,
  proposal_creator,
  ether_amount,
  desc,
  bytecode,
  debating_period,
  ether_deposit,
  is_split_proposal
) {
  assert(argdao.isFueled(), "Failed to create a proposal because the DAO is not fueled.");
  
  var dao_closing_time = argdao.closingTime();
  assert(!dao_closing_time.gt(time_now()), "Failed to create a proposal because the DAO's " +
    "creation time has not yet closed.\\ndao_closing_time: "+ dao_closing_time +
    "\\nnow(): " + time_now());
    
  var proposals_num_before = argdao.numberOfProposals();
  argdao.newProposal(
    recipient, web3.toWei(ether_amount, "ether"),
    desc,
    bytecode,
    debating_period,
    is_split_proposal,
    {
      from: proposal_creator,
      value: web3.toWei(ether_deposit, "ether"),
      gas: 1000000
    }
  );
  
  var proposals_num_now = argdao.numberOfProposals();
  assert(proposals_num_now.equals(proposals_num_before.add(1)), "Proposal has not been created");

  return proposals_num_now;
}

function time_now() {
    return Math.floor(Date.now() / 1000);
}

module.exports = {
  compile: compile,
  waitForReceipt: waitForReceipt,
  attempt_proposal: attempt_proposal
};