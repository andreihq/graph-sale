const Web3 = require("web3");
const EthereumTx = require('ethereumjs-tx').Transaction;
const fs = require('fs');
const BigNumber = require('bignumber.js');

const CONFIG = {
  ADDRESS: "",
  PRIVATE_KEY: "",
  INFURA_KEY: "",

  ETH_AMOUNT: 0.3, 
  START_SPAM_BEFORE: 25, // send first tx this many seconds before (you can use this to control sending txs few blocks earlier)
  START_TIME: 1603468800000, // October 23, 2020 4:00:00 PM GMT+0
  GAS_PRICE: 200, // GWEI
  GAS_LIMIT: 150000,
  MAX_RETRY: 5
}

const GRAPH_ADDRESS = "0x09695a6DFf47B0053eF9553FEe49D2d833afA68b";
const GRAPH_ABI = JSON.parse(fs.readFileSync('./graph-abi.json'));

//let web3 = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${CONFIG.INFURA_KEY}`));
let web3 = new Web3(new Web3.providers.WebsocketProvider(
  `wss://mainnet.infura.io/ws/v3/${CONFIG.INFURA_KEY}`,
  {
      clientConfig: {
          maxReceivedFrameSize: 100000000,
          maxReceivedMessageSize: 100000000,
      }
  }
));

const GRAPH_CONTRACT = new web3.eth.Contract(GRAPH_ABI, GRAPH_ADDRESS)

const PURCHASE_TX = GRAPH_CONTRACT.methods.buyTokens(
  CONFIG.ADDRESS
);

let state = {
  txCount: 0,
  txSent: false,
  retries: 0
}

const sendTransaction = () => {
  console.log("Sending transaction...");
    // construct the transaction data
    state.txSent = true;

    const txData = {
      nonce: web3.utils.toHex(state.txCount),
      gasLimit: web3.utils.toHex(CONFIG.GAS_LIMIT),
      gasPrice: web3.utils.toHex(CONFIG.GAS_PRICE * 1000000000),
      to: GRAPH_ADDRESS,
      from: CONFIG.ADDRESS,
      value: "0x" + new BigNumber(CONFIG.ETH_AMOUNT).multipliedBy(1e18).toString(16),
      data: PURCHASE_TX.encodeABI()
    }

    const privateKey = Buffer.from(CONFIG.PRIVATE_KEY, 'hex');
    const transaction = new EthereumTx(txData);
    transaction.sign(privateKey);
    const serializedTx = transaction.serialize().toString('hex');

    // on transaction confirmation, if reverted try again
    web3.eth.sendSignedTransaction('0x' + serializedTx)
      .on("confirmation", function(confirmationNumber, receipt){
        // only interested in 1st confirmation
        if (confirmationNumber == 0) {
          //if tx failed, retry
          if (!receipt.status) {
            console.log("Transaction reverted.")
            if (state.retries < CONFIG.MAX_RETRY) {
              state.txCount++;
              state.retries++;
              console.log(`Retrying... ${state.retries}/${CONFIG.MAX_RETRY}`);
              sendTransaction()
            }
          } 
        }
      })
      .on("error", () => {
        console.error
      });
}

(async () => {
  state.txCount = await web3.eth.getTransactionCount(CONFIG.ADDRESS);

  let sub = web3.eth.subscribe('newBlockHeaders', (error, blockHeader) => {
    if (error) {
      console.error(`Unable to subscribe to new blocks: ${error}`);
      return;
    }

    if (blockHeader.number == null) {
      return;
    }

    let blockTime = blockHeader.timestamp * 1000;
    let startTime = CONFIG.START_TIME - (CONFIG.START_SPAM_BEFORE * 1000);

    if (!state.txSent) {
      console.log(`New Block timestamp: ${blockTime}`);
      console.log(`Time Left: ${Math.round((startTime - blockTime)/1000)} seconds\n`);

      if (blockTime >= startTime) {
        sendTransaction();
      }
    }
  })
  .on("connected", (subscriptionId) => {
    console.log(`Subscribing to new block: SUCCESS\nListening...\n`);
  })
  .on("data", (data) => {})
  .on("error", console.error);
})();