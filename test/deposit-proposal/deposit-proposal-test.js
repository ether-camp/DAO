var assert = require('assert');
var _ = require('lodash');
var async = require('async');
var Sandbox = require('ethereum-sandbox-client');
var SolidityFunction = require('web3/lib/web3/function');
var helper = require('ethereum-sandbox-helper');

describe('Deposit proposal', function() {
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
  var recipient = '0xdedb49385ad5b94a16f236a6890cf9e0b1e30392';
  var sandbox = new Sandbox('http://localhost:8555');
  var compiled = helper.compile('.', ['DAO.sol']);
  var creator, dao, proposalBytecode, proposalId;
  
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
        Math.floor(Date.now() / 1000) + 5, // closing time
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
            else helper.waitForReceipt(sandbox.web3, txHash, cb);
          });
        },
        cb
      );
    }
    function waitForClosing(cb) {
      var check = setInterval(function() {
        if (dao.closingTime().lt(Math.floor(Date.now() / 1000))) {
          clearInterval(check);
          cb();
        }
      }, 2000);
    }
  });
  
  it('Allow the recipient', function(done) {
    dao.changeAllowedRecipients(recipient, true, { from: curator }, function(err, txHash) {
      if (err) done(err);
      else helper.waitForReceipt(sandbox.web3, txHash, function(err) {
        if (err) return done(err);
        assert(dao.allowedRecipients(recipient), 'The recipient is not allowed');
        done();
      });
    });
  });
  
  it('Create a proposal', function(done) {
    proposalBytecode = getProposalBytecode(20);
    dao.newProposal(
      recipient,
      sandbox.web3.toWei(20, 'ether'),
      'Proposal#1',
      proposalBytecode,
      5,
      false,
      {
        from: participants[0].address,
        value: sandbox.web3.toWei(20, 'ether'),
        gas: 1000000
      },
      function(err, txHash) {
        if (err) done(err);
        else helper.waitForReceipt(sandbox.web3, txHash, function(err, receipt) {
          if (err) return done(err);
          assert.equal(dao.numberOfProposals(), 1, 'Proposal has not been created');
          proposalId = 1;
          done();
        });
      }
    );
  });
  
  it('Vote for the proposal', function(done) {
    async.each(
      participants,
      function(participant, cb) {
        dao.vote(proposalId, true, { from: participant.address }, function(err, txHash) {
          if (err) cb(err);
          else helper.waitForReceipt(sandbox.web3, txHash, cb);
        });
      },
      function(err) {
        if (err) done(err);
        else waitForDebatingPeriodFinish(done);
        
        function waitForDebatingPeriodFinish(cb) {
          var check = setInterval(function() {
            if (dao.proposals(proposalId)[3].lt(Math.floor(Date.now() / 1000))) {
              clearInterval(check);
              cb();
            }
          }, 2000);
        }
      }
    );
  });
  
  it('Execute the proposal', function(done) {
    dao.executeProposal(proposalId, proposalBytecode, participants[0].address,{
      from: participants[0].address
    }, function(err, txHash) {
      if (err) done(err);
      else helper.waitForReceipt(sandbox.web3, txHash, function(err, receipt) {
        if (err) return done(err);
        assert(!dao.proposals(proposalId)[4], 'The proposal is not closed');
        assert(dao.proposals(proposalId)[5], 'The proposal has not passed');
        done();
      });
    });
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