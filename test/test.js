var config   = require('../config/import.config');
var assert   = require('assert');
var Promise  = require('bluebird');
var request  = require('request');
var Postgres = require('../import/postgres/client');
var Server   = require('../api/server');
var fs       = require('fs');
var path     = __dirname + '/ledgers/';
var files    = fs.readdirSync(path);
var dbConfig = config.get('postgres');
var port     = 7111;
var server;
var db;

dbConfig.database = config.get('dbname') || 'test_db';
db     = new Postgres(dbConfig);
server = new Server({postgres:dbConfig, port:port});

describe('ETL and API:', function() {

  before(function(done) {
    console.log('migrating database...');
    db.migrate().then(function(){
      console.log('done');
      done();
    });
  });
  
  /*** import ledgers into Postgres ***/
  
  it('should save ledgers and transactions into the database', function(done) {
    Promise.map(files, function(filename) {
      return new Promise(function(resolve, reject) {
        var ledger = JSON.parse(fs.readFileSync(path + filename, "utf8"));
        db.saveLedger(ledger, function(err, resp){
          if (err) reject(err);
          else     resolve();
        });
      });
    }).nodeify(function(err, resp) {
      assert.ifError(err);
      done();
    });
  });
  
  /*** run mulitple API's ***/
  
  it('should run up to 40 API servers simultaneously', function(done) {
    var count = 100;
    var server;
    var port;
    
    while (count-- > 60) {
      port   = '322' + count;
      server = new Server({
        postgres : dbConfig, 
        port     : port
      }); 
    }
    
    //test the last one
    var url = 'http://localhost:' + port + '/v1/ledgers';
    request({
      url: url,
      json: true,
    }, 
    function (err, res, body) {
      assert.ifError(err);
      assert.strictEqual(typeof body, 'object');
      assert.strictEqual(body.result, 'success');
      done();
    });
  }); 
  
  /*** ledgers API endpoint ***/
  
  describe('/v1/ledgers', function() {
    
    it('should return the latest ledger: /v1/ledgers', function(done) {
      var url = 'http://localhost:' + port + '/v1/ledgers';
      request({
        url: url,
        json: true,
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        assert.strictEqual(typeof body.ledger, 'object');
        assert.strictEqual(body.ledger.ledger_index, 11119607);
        assert.strictEqual(body.ledger.transactions, undefined);
        done();
      });
    }); 

    it('should return ledgers by ledger index: /v1/ledgers/:ledger_index', function(done) {
      var url = 'http://localhost:' + port + '/v1/ledgers/11119599';
      request({
        url: url,
        json: true,
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        assert.strictEqual(typeof body.ledger, 'object');
        assert.strictEqual(body.ledger.ledger_index, 11119599);
        assert.strictEqual(body.ledger.transactions, undefined);
        done();
      });
    });  

    it('should return an error if the ledger is not found: /v1/ledgers/:ledger_index', function(done) {
      var url = 'http://localhost:' + port + '/v1/ledgers/20000';
      request({
        url: url,
        json: true,
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(res.statusCode, 404);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'error');
        assert.strictEqual(body.message, 'ledger not found');
        done();
      });
    });   

    it('should return ledgers by ledger hash: /v1/ledgers/:ledger_hash', function(done) {
      var url = 'http://localhost:' + port + '/v1/ledgers/b5931ad267e59306769309aff13fccd55c2ef944e99228c8f2eeec5d3b49234d';
      request({
        url: url,
        json: true,
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        assert.strictEqual(typeof body.ledger, 'object');
        assert.strictEqual(body.ledger.ledger_hash, 'b5931ad267e59306769309aff13fccd55c2ef944e99228c8f2eeec5d3b49234d');
        assert.strictEqual(body.ledger.transactions, undefined);
        done();
      });
    });   

    it('should return an error if the hash is invald: /v1/ledgers/:ledger_hash', function(done) {
      var url = 'http://localhost:' + port + '/v1/ledgers/b59';
      request({
        url: url,
        json: true,
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'error');
        assert.strictEqual(body.message, 'invalid ledger identifier');
        done();
      });
    });
    
    it('should return ledgers by date: /v1/ledgers/:date', function(done) {
      var url = 'http://localhost:' + port + '/v1/ledgers/2015-01-14 17:43:10';
      request({
        url: url,
        json: true,
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        assert.strictEqual(typeof body.ledger, 'object');
        assert.strictEqual(body.ledger.transactions, undefined);
        done();
      });
    });      

    it('should include transaction hashes with transactions=true', function(done) {
      var url = 'http://localhost:' + port + '/v1/ledgers';
      request({
        url: url,
        json: true,
        qs: {
          transactions : true,
        }
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body.ledger.transactions, 'object');
        body.ledger.transactions.forEach(function(hash) {
          assert.strictEqual(typeof hash, 'string');
          assert.strictEqual(hash.length, 64);
        });
        
        done();
      });
    });
      
    it('should include transaction json with expand=true', function(done) {
      var url = 'http://localhost:' + port + '/v1/ledgers';
      request({
        url: url,
        json: true,
        qs: {
          expand : true
        }
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body.ledger.transactions, 'object');
        body.ledger.transactions.forEach(function(tx) {
          assert.strictEqual(typeof tx, 'object');
          assert.strictEqual(typeof tx.tx, 'object');
          assert.strictEqual(typeof tx.meta, 'object');
          assert.strictEqual(typeof tx.hash, 'string');
          assert.strictEqual(typeof tx.date, 'string');
          assert.strictEqual(typeof tx.ledger_index, 'number');
        });
        
        done();
      });      
    });
    
    it('should include transaction binary with binary=true', function(done) {
      var url = 'http://localhost:' + port + '/v1/ledgers';
      request({
        url: url,
        json: true,
        qs: {
          binary : true
        }
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body.ledger.transactions, 'object');
        body.ledger.transactions.forEach(function(tx) {
          assert.strictEqual(typeof tx, 'object');
          assert.strictEqual(typeof tx.tx, 'string');
          assert.strictEqual(typeof tx.meta, 'string');
          assert.strictEqual(typeof tx.hash, 'string');
          assert.strictEqual(typeof tx.date, 'string');
          assert.strictEqual(typeof tx.ledger_index, 'number');
        });
        
        done();
      }); 
    });
  });
  
  /*** accounts:/account/transactions API endpoint ***/
  
  describe('/v1/accounts/:account/transactions', function() {

    
    it('should return the last 20 transactions', function(done) {
      var account = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
      var url = 'http://localhost:' + port + '/v1/accounts/' + account + '/transactions';
      
      request({
        url: url,
        json: true,
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        assert.strictEqual(body.count, 20);
        assert.strictEqual(body.total, 21);
        assert.strictEqual(body.transactions.length, 20);
        body.transactions.forEach(function(tx) {
          assert.strictEqual(typeof tx.meta, 'object');
          assert.strictEqual(typeof tx.tx, 'object');
        });        
        done();
      });
    }); 
    
    it('should return limit the returned transactions to 5', function(done) {
      var account = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
      var url = 'http://localhost:' + port + '/v1/accounts/' + account + '/transactions';
      
      request({
        url: url,
        json: true,
        qs: {
          limit : 5,
          offset : 5
        }
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        assert.strictEqual(body.count, 5);
        assert.strictEqual(body.total, 21);
        assert.strictEqual(body.transactions.length, 5);
        done();
      });
    });  
    
    
    it('should return return only specified transaction types', function(done) {
      var account = 'rLYjdzUVrA5prATG1r5ZTmsUQCohkD8tFz';
      var url = 'http://localhost:' + port + '/v1/accounts/' + account + '/transactions';
      
      request({
        url: url,
        json: true,
        qs: {
          type : 'OfferCreate,OfferCancel',
        }
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        body.transactions.forEach(function(tx) {
          assert(['OfferCreate','OfferCancel'].indexOf(tx.tx.TransactionType) !== -1);
        });
        done();
      });
    }); 
    
    it('should return return only specified transaction results', function(done) {
      var account = 'rfZ4YjC4CyaKFx9cgzYNKk4E2zTXRJif26';
      var result  = 'tecUNFUNDED_OFFER';
      var url = 'http://localhost:' + port + '/v1/accounts/' + account + '/transactions';
      
      request({
        url: url,
        json: true,
        qs: {
          limit : 5,
          result : result,
        }
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        body.transactions.forEach(function(tx) {
          assert.strictEqual(tx.meta.TransactionResult, result);
        });
        done();
      });
    });
    
    it('should return transactions for a given date range', function(done) {
      var account = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
      var url = 'http://localhost:' + port + '/v1/accounts/' + account + '/transactions';
      
      request({
        url: url,
        json: true,
        qs: {
          start : '2015-01-14 18:27:10',
          end   : '2015-01-14 18:27:20',
        }
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        assert.strictEqual(body.count, 8);
        assert.strictEqual(body.total, 8);
        assert.strictEqual(body.transactions.length, 8);
        done();
      });
    });

    it('should return transactions for a given date range', function(done) {
      var account = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
      var url = 'http://localhost:' + port + '/v1/accounts/' + account + '/transactions';
      var max = 11119607;
      var min = 11119603;
      
      request({
        url: url,
        json: true,
        qs: {
          ledger_min : min,
          ledger_max : max,
        }
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        assert.strictEqual(body.transactions.length, 11);
        body.transactions.forEach(function(tx) {
          assert(tx.ledger_index >= min);
          assert(tx.ledger_index <= max);
        });
        done();
      });
    });
    
    it('should return return results in binary form', function(done) {
      var account = 'rfZ4YjC4CyaKFx9cgzYNKk4E2zTXRJif26';
      var url = 'http://localhost:' + port + '/v1/accounts/' + account + '/transactions';
      
      request({
        url: url,
        json: true,
        qs: {
          limit : 5,
          binary : true
        }
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        body.transactions.forEach(function(tx) {
          assert.strictEqual(typeof tx.meta, 'string');
          assert.strictEqual(typeof tx.tx, 'string');
        });
        done();
      });
    }); 
    
    it('should return results in ascending order', function(done) {
      var account = 'rMwjYedjc7qqtKYVLiAccJSmCwih4LnE2q';
      var url  = 'http://localhost:' + port + '/v1/accounts/' + account + '/transactions';
      var last = 0;
      
      request({
        url: url,
        json: true,
        qs: {
          descending:false,
          limit:100
        }
      }, 
      function (err, res, body) {
        assert.ifError(err);
        assert.strictEqual(typeof body, 'object');
        assert.strictEqual(body.result, 'success');
        //assert.strictEqual(body.transactions.length, 20);
        body.transactions.forEach(function(tx) {          
          assert(last <= tx.ledger_index);   
          last = tx.ledger_index;
        });        
        done();
      });
    }); 
  });
});
