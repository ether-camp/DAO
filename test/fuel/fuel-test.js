var assert = require('assert');
var async = require('async');
var Sandbox = require('ethereum-sandbox-client');
var helper = require('ethereum-sandbox-helper');

describe('Fuel', function() {
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
  var sandbox = new Sandbox('http://localhost:8554');
  var compiled = helper.compile('.', ['DAO.sol', 'PFOffer.sol', 'Offer.sol', 'USNRewardPayOut.sol']);
  if (compiled.errors) {
    console.error(compiled.errors);
    throw 'Could not compile contracts.';
  }
  var creator, dao;
  
  before(function(done) {
    async.series([
      sandbox.start.bind(sandbox, __dirname + '/ethereum.json'),
      deployCreator,
      deployDAO
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
        Math.floor(Date.now() / 1000) + 50, // closing time
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
  });
  
  it('Buy tokens', function(done) {
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
      function(err) {
        if (err) return done(err);
        console.log('total ' + dao.totalSupply());
        assert(dao.isFueled(), 'DAO is not fueled');
        done();
      }
    );
  });
  
  after(function(done) {
    sandbox.stop(done);
  });
});