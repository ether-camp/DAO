var assert = require('assert');
var _ = require('lodash');
var async = require('async');
var Sandbox = require('ethereum-sandbox-client');
var SolidityFunction = require('web3/lib/web3/function');
var util = require('../util');

describe('Deposit', function() {
  this.timeout(60000);
  
  var curator = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
  var participants = [
    {
      address: '0x3992e68ccc25ba61fa46730f0c1f3069ddfef39d',
      amount: 30
    },
    {
      address: '0x400ca360444187bd7507ec05d18fa1e833304b9f',
      amount: 40
    }
  ];
  var contractor = '0xdedb49385ad5b94a16f236a6890cf9e0b1e30392';
  var sandbox = new Sandbox('http://localhost:8555');
  var compiled = util.compile('.', ['DAO.sol', 'PFOffer.sol', 'Offer.sol', 'USNRewardPayOut.sol']);
  var creator, dao;
  
  before(function(done) {
    async.series([
      sandbox.start.bind(sandbox, __dirname + '/ethereum.json'),
      deployCreator,
      deployDAO,
      fuel,
      waitForClosing
    ], done);
    
    function deployCreator(cb) {
      sandbox.web3.eth.contract(JSON.parse(compiled.contracts['DAO_Creator'].interface)).new({
        from: curator,
        data: '0x' + compiled.contracts['DAO_Creator'].bytecode
      }, function(err, contract) {
  	    if (err) cb(err);
  	    else if (contract.address) {
  	      creator = contract;
  	      cb();
  	    }
      });
    }
    function deployDAO(cb) {
      sandbox.web3.eth.contract(JSON.parse(compiled.contracts['DAO'].interface)).new(
        curator,
        creator.address,
        20, // proposal deposit
        sandbox.web3.toWei(40, "ether"), // min tokens to create
        Math.floor(Date.now() / 1000) + 3, // closing time
        0, // private creation
        "Token", // token name
        "TKN", // token symbol
        2, // decimal places
        {
          from: curator,
          data: '0x' + compiled.contracts['DAO'].bytecode
        },
        function(err, contract) {
          if (err) cb(err);
          else if (contract.address) {
            dao = contract;
            cb();
          }
        }
      );
    }
    function fuel(cb) {
      async.each(
        participants,
        function(participant, cb) {
          sandbox.web3.eth.sendTransaction({
            from: participant.address,
            to: dao.address,
            gas: 200000,
            value: sandbox.web3.toWei(participant.amount, "ether")
          }, function(err, txHash) {
            if (err) cb(err);
            else util.waitForReceipt(sandbox.web3, txHash, cb);
          });
        },
        done
      );
    }
    function waitForClosing(cb) {
      setTimeout(cb, 20000);
    }
  });
  
  it('Proposal', function(done) {
    var prop_id = util.attempt_proposal(
      sandbox.web3,
      dao, // DAO in question
      dao.address, // recipient
      contractor, // proposal creator
      0, // proposal amount in ether
      'Changing proposal deposit', // description
      getProposalBytecode(20), // bytecode
      15, // debating period
      20, // proposal deposit in ether
      false // whether it's a split proposal or not
    );
    done();
  });
  
  after(function(done) {
    sandbox.stop(done);
  });
  
  function getProposalBytecode(deposit) {
    var abi = JSON.parse(compiled.contracts['DAO'].interface);
    var func = new SolidityFunction(sandbox.web3, _.find(abi, { name: 'changeProposalDeposit' }), '');
    return func.toPayload([ deposit ]).data;
  }
});