const { ethers, network: hardhatNetwork } = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');

const ERC20_ABI = [
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];
const BNB_MAINNET_CHAIN_ID = 56n;
const BNB_PEGGED_USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

async function main() {
  const ownerAddress = process.env.OWNER_ADDRESS;

  if (!ownerAddress || !ethers.isAddress(ownerAddress)) {
    throw new Error('OWNER_ADDRESS must be set to the intended vault owner (preferably a Safe multisig).');
  }

  const network = await ethers.provider.getNetwork();
  if (hardhatNetwork.name !== 'bscMainnet' || network.chainId !== BNB_MAINNET_CHAIN_ID) {
    throw new Error(`Refusing deployment on chain ${network.chainId}; Magellan is restricted to BNB Smart Chain Mainnet (chain 56).`);
  }
  const usdtAddress = ethers.getAddress(BNB_PEGGED_USDT_ADDRESS);
  if ((await ethers.provider.getCode(usdtAddress)) === '0x') {
    throw new Error('The configured Binance-Peg BSC-USD address has no contract code on BNB Mainnet.');
  }

  const token = new ethers.Contract(usdtAddress, ERC20_ABI, ethers.provider);
  const [name, decimals, symbol] = await Promise.all([token.name(), token.decimals(), token.symbol()]);
  if (name !== 'Tether USD' || symbol !== 'USDT' || decimals !== 18n) {
    throw new Error(`Token metadata did not match expected Binance-Peg BSC-USD metadata (${name}, ${symbol}, ${decimals}). Refusing deployment.`);
  }

  const [deployer] = await ethers.getSigners();
  const Magellan = await ethers.getContractFactory('Magellan');
  const contract = await Magellan.deploy(usdtAddress, ownerAddress);

  await contract.waitForDeployment();
  const deploymentReceipt = await contract.deploymentTransaction().wait();

  console.log('Magellan deployed to:', await contract.getAddress());
  console.log('Deployer:', deployer.address);
  console.log('Vault owner:', ownerAddress);
  console.log(`Token: Binance-Peg BSC-USD (${usdtAddress}), ${decimals} decimals`);

  const frontendConfig = {
    chainId: Number(network.chainId),
    networkName: 'BNB Smart Chain Mainnet',
    contractAddress: await contract.getAddress(),
    runtimeCodeHash: ethers.keccak256(await ethers.provider.getCode(await contract.getAddress())),
    tokenAddress: usdtAddress,
    tokenSymbol: 'USDT (Binance-Peg BSC-USD)',
    tokenDecimals: Number(decimals),
    deploymentBlock: deploymentReceipt.blockNumber
  };
  const configPath = path.join(__dirname, '..', 'app', 'deployment.json');
  fs.writeFileSync(configPath, `${JSON.stringify(frontendConfig, null, 2)}\n`);
  console.log('Frontend config written to app/deployment.json');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
