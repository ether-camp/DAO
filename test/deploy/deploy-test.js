var _ = require('lodash');
var Sandbox = require('ethereum-sandbox-client');
var util = require('../util');

describe('Deployment', function() {
  this.timeout(60000);
  
  var curator = '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826';
  var contractor = '0xdedb49385ad5b94a16f236a6890cf9e0b1e30392';
  var sandbox = new Sandbox('http://localhost:8554');
  var compiled = util.compile('.', ['DAO.sol', 'PFOffer.sol', 'Offer.sol', 'USNRewardPayOut.sol']);
  var creator, dao, offer;
  
  before(function(done) {
    sandbox.start(__dirname + '/ethereum.json', done);
  });
  
  it('Deploy DAO_Creator', function(done) {
    sandbox.web3.eth.contract(JSON.parse(compiled.contracts['DAO_Creator'].interface)).new({
      from: curator,
      data: '0x' + compiled.contracts['DAO_Creator'].bytecode
    }, function(err, contract) {
	    if (err) done(err);
	    else if (contract.address) {
	      creator = contract;
	      done();
	    }
    });
  });
  
  it('Deploy DAO', function(done) {
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
        if (err) done(err);
        else if (contract.address) {
          dao = contract;
          done();
        }
      }
    );
  });
  
  it('Deploy PFOffer', function(done) {
    sandbox.web3.eth.contract(JSON.parse(compiled.contracts['PFOffer'].interface)).new(
      contractor,
      dao.address,
      '0x0',  // This is a hash of the paper contract. Does not matter for testing
      sandbox.web3.toWei(20, "ether"), // total costs
      sandbox.web3.toWei(20, "ether"), // one time costs
      sandbox.web3.toWei(1, "ether"), // min daily cost
      {
        from: contractor,
        data: '0x' + compiled.contracts['PFOffer'].bytecode
      }, function(err, contract) {
  	    if (err) done(err);
  	    else if (contract.address) done();
      }
    );
  });
  
  it('Deploy Offer', function(done) {
    sandbox.web3.eth.contract(JSON.parse(compiled.contracts['Offer'].interface)).new(
      contractor,
      dao.address,
      '0x0',  // This is a hash of the paper contract. Does not matter for testing
      sandbox.web3.toWei(20, "ether"), // total costs
      sandbox.web3.toWei(20, "ether"), // one time costs
      sandbox.web3.toWei(1, "ether"), // min daily cost
      {
        from: contractor,
        data: '0x' + compiled.contracts['Offer'].bytecode
      }, function(err, contract) {
  	    if (err) done(err);
  	    else if (contract.address) {
  	      offer = contract;
  	      done();
  	    }
      }
    );
  });
  
  it('Deploy USNRewardPayOut', function(done) {
    sandbox.web3.eth.contract(JSON.parse(compiled.contracts['USNRewardPayOut'].interface)).new(
      offer.address,
      {
        from: contractor,
        data: '0x' + compiled.contracts['USNRewardPayOut'].bytecode
      }, function(err, contract) {
  	    if (err) done(err);
  	    else if (contract.address) done();
      }
    );
  });
  
  after(function(done) {
    sandbox.stop(done);
  });
});
