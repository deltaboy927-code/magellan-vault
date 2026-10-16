const { ethers } = require('ethers');
const fs = require('node:fs');
const path = require('node:path');

const BNB_MAINNET_CHAIN_ID = 56n;
const BNB_PEGGED_USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const VAULT_ABI = [
  'function usdt() view returns (address)',
  'function owner() view returns (address)'
];
const TOKEN_ABI = [
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

async function main() {
  const [contractAddressInput, deploymentBlockInput] = process.argv.slice(2);
  if (!contractAddressInput || !ethers.isAddress(contractAddressInput)) {
    throw new Error('Usage: npm run configure:frontend -- <contractAddress> <deploymentBlock>');
  }
  if (!deploymentBlockInput || !/^\d+$/.test(deploymentBlockInput)) {
    throw new Error('Provide the deployment block number shown for the contract creation transaction.');
  }

  const contractAddress = ethers.getAddress(contractAddressInput);
  const deploymentBlock = Number(deploymentBlockInput);
  if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock < 1) {
    throw new Error('The deployment block must be a positive safe integer.');
  }

  const rpcUrl = process.env.BSC_MAINNET_URL || 'https://bsc-dataseed.bnbchain.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== BNB_MAINNET_CHAIN_ID) {
    throw new Error(`Refusing to configure a contract on chain ${network.chainId}; expected BNB Mainnet (56).`);
  }

  const [contractCode, currentBlock] = await Promise.all([
    provider.getCode(contractAddress),
    provider.getBlockNumber()
  ]);
  if (contractCode === '0x') throw new Error('No contract code found at the supplied address.');
  if (deploymentBlock > currentBlock) throw new Error('Deployment block is later than the current BNB Mainnet block.');

  const vault = new ethers.Contract(contractAddress, VAULT_ABI, provider);
  const [tokenAddress, ownerAddress] = await Promise.all([vault.usdt(), vault.owner()]);
  if (ethers.getAddress(tokenAddress) !== ethers.getAddress(BNB_PEGGED_USDT_ADDRESS)) {
    throw new Error(`The vault token is ${tokenAddress}, not the configured Binance-Peg BSC-USD token.`);
  }
  if (!ethers.isAddress(ownerAddress) || ownerAddress === ethers.ZeroAddress) {
    throw new Error('The contract returned an invalid owner address.');
  }

  const token = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);
  const [name, decimals, symbol] = await Promise.all([
    token.name(),
    token.decimals(),
    token.symbol()
  ]);
  if (name !== 'Tether USD' || symbol !== 'USDT' || decimals !== 18n) {
    throw new Error(`Token metadata did not match expected metadata (${name}, ${symbol}, ${decimals}).`);
  }

  const config = {
    chainId: Number(network.chainId),
    networkName: 'BNB Smart Chain Mainnet',
    contractAddress,
    runtimeCodeHash: ethers.keccak256(contractCode),
    tokenAddress: ethers.getAddress(tokenAddress),
    tokenSymbol: 'USDT (Binance-Peg BSC-USD)',
    tokenDecimals: Number(decimals),
    deploymentBlock
  };
  const configPath = path.join(__dirname, '..', 'app', 'deployment.json');
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Public frontend config written to ${configPath}`);
  console.log(`Vault owner: ${ownerAddress}`);
  console.log('This read-only step did not request a wallet signature or use a private key.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
