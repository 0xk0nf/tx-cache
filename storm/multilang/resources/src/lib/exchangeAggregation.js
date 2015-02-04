var Logger  = require('./modules/logger');
var moment  = require('moment');
var Promise = require('bluebird');
var utils   = require('./utils');

var LI_PAD  = 12;
var I_PAD   = 5;

/**
 * ExchangeAggregation
 */

function ExchangeAggregation(options) {
  var self    = this;
  var logOpts = {
    scope : 'exchange-aggregation',
    file  : options.logFile,
    level : options.logLevel
  };
    
  this.hbase    = options.hbase;
  this.log      = new Logger(logOpts);
  this.base     = options.base;
  this.counter  = options.counter;
  this._ready   = false;
  this.incoming = [ ];
  this.cached   = { 
    minute : { },
    hour   : { },
    day    : { },
    month  : { }
  };
  
  this.earliest = moment.utc().startOf('minute');
  this.keyBase  = this.base.currency + 
    '|' + (this.base.issuer || '')   + 
    '|' + this.counter.currency      + 
    '|' + (this.counter.issuer || '');
  
  //remove older data every hour
  this.purge = setInterval(function(){
    self._ready = false;

    var minute = moment.utc().startOf('hour').subtract(1, 'hour');
    var hour   = moment.utc().startOf('day').subtract(1, 'day');
    var day    = moment.utc().startOf('month').subtract(1, 'month');
    var month  = moment.utc().startOf('year').subtract(1, 'year');
    
    //remove cached minutes
    for (time in self.cached['minute']) {
      if (minute.diff(time) > 0) {
        delete self.cached['minute'][time];
      }
    }

    //remove cached hours
    for (time in self.cached['hour']) {
      if (minute.diff(time) > 0) {
        delete self.cached['hour'][time];
      }
    }
    
    //remove cached days
    for (time in self.cached['day']) {
      if (minute.diff(time) > 0) {
        delete self.cached['day'][time];
      }
    }
    
    //remove cached months
    for (time in self.cached['month']) {
      if (minute.diff(time) > 0) {
        delete self.cached['month'][time];
      }
    }
    
    if (minute.diff(self.earliest) > 0) {
      self.earliest = minute;
    }
    
    self._ready = true;

  }, 60 * 60 * 1000);
  
  //load exchanges from
  //the current minute  
  load(function(err, resp) {
    aggregate();
  });
  
  /**
   * load
   * initialize with all the existing
   * data from hbase that we need to
   * calculate aggregations going forward
   */
  
  function load (done) {
    Promise.all([
      self._getHistory(self.earliest, 'minute'),
      self._getHistory(self.earliest, 'hour'),
      self._getHistory(self.earliest, 'day'),
      self._getHistory(self.earliest, 'month'),
      self._getHistory(self.earliest, 'year')
    ])
    .nodeify(function(err, resp) {
       if (err) {
        self.log.error(err);
      }
      
      self._ready = true;
      done();
    });
  }
  
  /**
   * aggregate
   * check for new aggregations
   * and aggregate as needed
   * function recursively calls itself
   * again when finished
   */
  
  function aggregate () {
    var incoming = [ ];
    
    if (!self.incoming.length) {
      setTimeout(aggregate, 200);
      return;
    }
    
    if (!self._ready) {
      setTimeout(aggregate, 200);
      return;      
    }
 
    //reset updated list
    self.updated  = { 
      agg_exchange_1minute  : { },
      agg_exchange_5minute  : { },
      agg_exchange_15minute : { },
      agg_exchange_30minute : { },
      agg_exchange_1hour    : { },
      agg_exchange_2hour    : { },
      agg_exchange_4hour    : { },
      agg_exchange_1day     : { },
      agg_exchange_3day     : { },
      agg_exchange_7day     : { },
      agg_exchange_1month   : { },
      agg_exchange_1year    : { },
    };
    
    incoming      = self.incoming;
    self.incoming = [ ];
    self._ready   = false;
    
    //start aggregation with incoming exchanges
    self._aggregateMinutes(incoming)
    .then(function() {
      return Promise.all([
        self._aggregateInterval(5,  'minute', 'minute'),
        self._aggregateInterval(15, 'minute', 'minute'),
        self._aggregateInterval(1,  'hour',   'minute')
      ]);
    })
    .then(function() {
      return Promise.all([
        self._aggregateInterval(2, 'hour', 'hour'),
        self._aggregateInterval(4, 'hour', 'hour'),
        self._aggregateInterval(1, 'day',  'hour')
      ]);
    })
    .then(function() {
      return Promise.all([
        self._aggregateInterval(3, 'day',   'day'),
        self._aggregateInterval(7, 'day',   'day'),
        self._aggregateInterval(1, 'month', 'day')
      ]);
    })
    .then(function() {
      return self._aggregateInterval(1, 'year', 'month'); 
    })
    .nodeify(function(err, resp) {
      
      if (err) {
        self.log.error(err, resp);
      }
      
      //execute callback functions
      //for incoming exchanges
      incoming.forEach(function(i) {
        if (i.callback) i.callback();
      });
      
      self._ready = true;
      setImmediate(aggregate);    
    });
  }
}

/**
 * add
 * add incoming exchanges
 * to the incoming queue
 */

ExchangeAggregation.prototype.add = function (ex, callback) {
  this.incoming.push({
    ex       : ex,
    callback : callback
  });
};

/**
 * _getHistory
 * get historical data from
 * hbase
 */

ExchangeAggregation.prototype._getHistory = function (time, period) {
  var self = this;
  var interval;
  var start;
  var end;

  time = moment.utc(time);
  
  if (period === 'minute') {
    start    = time.startOf('minute').subtract(1, 'minute');
    end      = moment.utc(time).add(2, 'minute');
    interval = undefined;
  
  } else if (period === 'hour') {
    start    = time.startOf('hour').subtract(1, 'hour');
    end      = moment.utc(time).add(2, 'hour');
    interval = 'minute'; 
    
  } else if (period === 'day') {
    start    = time.startOf('day').subtract(1, 'day');
    end      = moment.utc(time).add(2, 'day');
    interval = 'hour'; 
  
  } else if (period === 'month') {
    start    = time.startOf('month').subtract(1, 'month');
    end      = moment.utc(time).add(2, 'month');
    interval = 'day'; 
  
  } else if (period === 'year') {
    start    = time.startOf('year').subtract(1, 'year');
    end      = moment.utc(time).add(2, 'year');
    interval = 'month'; 
  
  } else {
    return Promise.reject('invalid period');
  }
  
  return new Promise(function(resolve, reject) {
    self.hbase.getExchanges({
      base     : self.base,
      counter  : self.counter,
      start    : start,
      end      : end,
      interval : '1' + interval
    }, 
    function (err, exchanges) {
      
      //console.log(time.format(), period, interval, exchanges.length, 'rows');
      
      if (!interval) {
        if (exchanges && exchanges.length) {
          exchanges.forEach(function(ex) {
            self.cacheExchange(ex);
          });
        }
      
      } else {
        exchanges.forEach(function(ex) {
          self.cached[interval][ex.start] = {
            exchanges : { },
            reduced   : ex
          }
        });
      }

      if (err) {
        self.log.error(err);
        reject(err);
        
      } else {
        resolve();
      }
    });    
  });
};

/**
 * aggregate1minute
 * aggregate incoming exchanges into
 * 1 minute intervals
 */

ExchangeAggregation.prototype._aggregateMinutes = function(incoming) {
  var self = this;
  var reduced;
  
  //cache incoming transactions
  for (var i=0; i<incoming.length; i++) {
    self.cacheExchange(incoming[i].ex, true);
  }

  //aggregate updated minutes
  for (var time in self.cached.minute) {
    if (self.cached.minute[time].updated) {
      key     = self.keyBase + '|' + utils.formatTime(time);
      reduced = self._reduce(self.cached.minute[time].exchanges); 
      
      if (reduced) {
        self.cached.minute[time].reduced       = reduced;      
        self.cached.minute[time].reduced.start = time;
        self.updated.agg_exchange_1minute[key] = self.cached.minute[time].reduced; 
        self.cached.minute[time].updated = false;
            
      } else {
        //this can be the case if the amounts
        //are too small to be counted
        self.log.error('NOT REDUCED', key, self.cached.minute[time]);
      }
    }
  }
  
  //save to hbase
  return self.hbase.putRows('agg_exchange_1minute', self.updated.agg_exchange_1minute);  
};

ExchangeAggregation.prototype._aggregateInterval = function (multiple, period, interval) {
  var self  = this;
  var times = { };  
  var table         = 'agg_exchange_' + multiple + period;
  var intervalTable = self.updated['agg_exchange_1' + interval];
  var time;
  var start;
  var end;
  var intervals;
  var reduced;
  
  //use updated minutes to determine
  //which intervals need to be udated
  for (key in intervalTable) {
    time = intervalTable[key].start;
    time = utils.getAlignedTime(time, period, multiple);
    times[time.format()] = time;
  }
  
  //reduce cached intervals 
  //for the period
  for (time in times) {
    start = moment.utc(times[time]);
    time  = times[time];
    end   = moment.utc(time).add(multiple, period);

    intervals = { };
    while (end.diff(time) > 0) {
      if (self.cached[interval][time.format()]) {
        intervals[time.format()] = self.cached[interval][time.format()].reduced;
      }
    
      time.add(1, interval);
    }
    


    key = self.keyBase + '|' + utils.formatTime(start);
    self.log.info(key, table);

    reduced = self._reduce(intervals, period);
    if (reduced) {
      reduced.start = start.format();
      self.updated[table][key] = reduced; 
      //console.log(reduced);

      //cache non-multiple intervals
      if (multiple === 1 && period !== 'year') {

        if (!self.cached[period][reduced.start]) {
          self.cached[period][reduced.start] = { }
        }

        self.cached[period][reduced.start].reduced = reduced;
      } 
    
    } else {
      self.log.error("NOT REDUCED", table, key);
    }
  }
  
  //console.log(table, self.updated[table]);

  //save to hbase
  return self.hbase.putRows(table, self.updated[table]);
};

/**
 * cacheExchange
 * add an exchange to
 * the cache
 */

ExchangeAggregation.prototype.cacheExchange = function (ex, update) {
  var t    = moment.utc(ex.time * 1000).startOf('minute');
  var time = t.format();
  var key  = ex.tx_hash + '|' + ex.node_index;
  var getMinute;
  
    
  //if this time preceeds the earliest time, 
  //ignore it for now, it will need other 
  //historical data than what is cached
  if (update && t.unix() < this.earliest.unix()) {
    this.log.info("time preceeds cached data:", t.format(), this.earliest.format());
    return;
  }
  
  //add the minute if it doesnt exist
  if (!this.cached.minute[time]) {
    this.cached.minute[time] = { 
      exchanges : { }
    };
  }
    
  //set as updated and add exchange
  this.cached.minute[time].updated        = update || false;
  this.cached.minute[time].exchanges[key] = formatExchange(ex);
};

/**
 * _reduce
 * reduce rows to single row
 */

ExchangeAggregation.prototype._reduce = function (rows, period) {
  var reduced;
  var row;
  var key;

  for (key in rows) {
    
    //excluding tiny amounts that exist from
    //rounding errors in XRP
    if (!period) {
      if (this.base.currency === 'XRP' && 
          rows[key].base_volume <= 0.0001) {
        continue;
      } else if (this.counter.currency === 'XRP' && 
          rows[key].counter_volume <= 0.0001) {
        continue;
      } 
    }
    
    if (!reduced) {
      reduced = JSON.parse(JSON.stringify(rows[key]));
      continue;
    }

    row = rows[key];
    
    //prefer sort open key    
    if (row.sort_open) {
      if (row.sort_open < reduced.sort_open) {
        reduced.sort_open = row.sort_open;
        reduced.open_time = row.open_time;
        reduced.open      = row.open;
      }

      if (row.sort_close > reduced.sort_close) {
        reduced.sort_close = row.sort_close;
        reduced.close_time = row.close_time;
        reduced.close      = row.close;
      }    
      
    //otherwise use open time  
    } else {
      if (row.open_time < reduced.open_time) {
        reduced.open_time = row.open_time;
        reduced.open      = row.open;
      }

      if (row.close_time > reduced.close_time) {
        reduced.close_time = row.close_time;
        reduced.close      = row.close;
      }
    }

    if (row.high > reduced.high)  reduced.high = row.high;
    if (row.low  < reduced.low)   reduced.low  = row.low;

    reduced.base_volume    += row.base_volume;
    reduced.counter_volume += row.counter_volume;
    reduced.count          += row.count;   
  }
  
  if (reduced) {
    reduced.vwap = reduced.counter_volume / reduced.base_volume;
  }
  
  return reduced;
}

/**
 * formatExchange
 * format an incoming exchange
 * to be aggregated
 */

function formatExchange (ex) {
  
  //create sort key based on ledger index, tx index, and node index
  var sort = utils.padNumber(ex.ledger_index, LI_PAD) + 
    '|' +  utils.padNumber(ex.tx_index, I_PAD) + 
    '|' +  utils.padNumber(ex.node_index, I_PAD);
  
  var rate = parseFloat(ex.rate);
  
  return {
    open_time      : ex.time,
    close_time     : ex.time,
    open           : rate,
    close          : rate,
    high           : rate,
    low            : rate,
    base_volume    : parseFloat(ex.base.amount),
    counter_volume : parseFloat(ex.counter.amount),
    count          : 1,
    sort_open      : sort,
    sort_close     : sort
  }
}

module.exports = ExchangeAggregation;