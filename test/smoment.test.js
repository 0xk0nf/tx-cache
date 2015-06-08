var smoment = require('../lib/smoment');
var moment = require('moment');
var assert  = require('assert');


describe('smoment: ', function() {

  before(function(done) {
    done();
  });

  it('should check date/time are parsed correctly', function(done) {

    assert.strictEqual(smoment('abcd'), undefined);
    assert.strictEqual(smoment(0).format(), '1970-01-01T00:00:00');
    assert.strictEqual(smoment().format(), moment().utc().format('YYYY-MM-DDTHH:mm:ss'));      // This might fail
    assert.strictEqual(smoment(946684800).format(), '2000-01-01T00:00:00');                    // Ripple Epoch
    assert.strictEqual(smoment('2015-03-04 18:22:33'), undefined);
    assert.strictEqual(smoment('2015-03-04T18:22:33').format(), '2015-03-04T18:22:33');
    done();
  });

  it('should check that start/end rows are computed correctly', function(done) {
    assert.strictEqual(smoment('2015').hbaseFormatStopRow(), smoment('2016').hbaseFormatStartRow());
    assert.strictEqual(smoment('2015-04').hbaseFormatStopRow(), smoment('2015-05').hbaseFormatStartRow());
    assert.strictEqual(smoment('2015-04').hbaseFormatStopRow(), smoment('2015-05-01T00:00:00').hbaseFormatStartRow());
    assert.strictEqual(smoment('2015-04-10').hbaseFormatStopRow(), smoment('2015-04-11T00:00:00').hbaseFormatStartRow());
    assert.strictEqual(smoment('2015-04-10T13').hbaseFormatStopRow(), smoment('2015-04-10T14:00:00').hbaseFormatStartRow()); 
    assert.strictEqual(smoment('2015-04-10T13:12').hbaseFormatStopRow(), smoment('2015-04-10T13:13:00').hbaseFormatStartRow());
    assert.strictEqual(smoment('2015-04-10T13:12:42').hbaseFormatStopRow(), smoment('2015-04-10T13:12:43').hbaseFormatStartRow());                
    done();
  });

})


