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

function waitForSandboxReceipt(web3, txHash, cb) {
  var called = false;
  var blockFilter = web3.eth.filter('latest');
  blockFilter.watch(function() {
    web3.sandbox.receipt(txHash, function(err, receipt) {
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

module.exports = {
  compile: compile,
  waitForReceipt: waitForReceipt,
  waitForSandboxReceipt: waitForSandboxReceipt
};