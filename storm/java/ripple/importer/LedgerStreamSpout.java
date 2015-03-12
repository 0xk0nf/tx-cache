package ripple.importer;

import backtype.storm.Config;
import backtype.storm.spout.ShellSpout;
import backtype.storm.topology.IRichSpout;
import backtype.storm.topology.OutputFieldsDeclarer;
import backtype.storm.tuple.Fields;

import java.util.Map;

public class LedgerStreamSpout extends ShellSpout implements IRichSpout {

  public LedgerStreamSpout() {
    super("node", "src/ledgerStreamSpout.js");
  }

  @Override
  public void declareOutputFields(OutputFieldsDeclarer declarer) {
    declarer.declareStream("txStream", new Fields("tx"));
    declarer.declareStream("statsAggregation", new Fields("stat", "label"));
  }

  @Override
  public Map<String, Object> getComponentConfiguration() {
    Config conf = new Config();
        return conf;
  }
}
