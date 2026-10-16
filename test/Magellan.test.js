const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Magellan', function () {
  let owner;
  let alice;
  let bob;
  let usdt;
  let vault;

  const ONE_DAY = 86400n;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory('MockUSDT');
    usdt = await MockUSDT.deploy();

    const Magellan = await ethers.getContractFactory('Magellan');
    vault = await Magellan.deploy(usdt.target, owner.address);

    await usdt.mint(owner.address, ethers.parseUnits('5000', 18));
    await usdt.connect(owner).approve(vault.target, ethers.MaxUint256);
  });

  it('allows only the owner to make multiple deposits into the shared vault', async function () {
    const first = ethers.parseUnits('1000', 18);
    const second = ethers.parseUnits('500', 18);

    await expect(vault.connect(alice).deposit(first))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount')
      .withArgs(alice.address);

    await vault.connect(owner).deposit(first);
    await vault.connect(owner).deposit(second);
    expect(await vault.getBalance()).to.equal(first + second);
  });

  it('requires the proposed new owner to accept ownership', async function () {
    await vault.connect(owner).transferOwnership(alice.address);
    expect(await vault.owner()).to.equal(owner.address);
    expect(await vault.pendingOwner()).to.equal(alice.address);

    await expect(vault.connect(alice).acceptOwnership())
      .to.emit(vault, 'OwnershipTransferred')
      .withArgs(owner.address, alice.address);
    expect(await vault.owner()).to.equal(alice.address);
  });

  it('allows only the owner to lock and withdraw', async function () {
    const amount = ethers.parseUnits('10', 18);
    await vault.connect(owner).deposit(amount);
    await expect(vault.connect(alice).lock(60n))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount')
      .withArgs(alice.address);
    await expect(vault.connect(alice).withdraw(amount))
      .to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount')
      .withArgs(alice.address);
  });

  it('rejects zero and non-contract token addresses', async function () {
    const Magellan = await ethers.getContractFactory('Magellan');
    await expect(Magellan.deploy(ethers.ZeroAddress, owner.address))
      .to.be.revertedWithCustomError(Magellan, 'ZeroAddress');
    await expect(Magellan.deploy(alice.address, owner.address))
      .to.be.revertedWithCustomError(Magellan, 'InvalidToken');
    await expect(Magellan.deploy(usdt.target, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(Magellan, 'OwnableInvalidOwner');
  });

  it('emits queryable deposit, lock, and withdrawal events for the UI history', async function () {
    const amount = ethers.parseUnits('25', 18);
    await vault.connect(owner).deposit(amount);

    const depositEvents = await vault.queryFilter(vault.filters.Deposited(owner.address));
    expect(depositEvents).to.have.length(1);
    expect(depositEvents[0].args.amount).to.equal(amount);

    await vault.connect(owner).lock(60n);
    const lockEvents = await vault.queryFilter(vault.filters.Locked());
    expect(lockEvents).to.have.length(1);
    expect(lockEvents[0].args.duration).to.equal(60n);

    await time.increase(61n);
    await vault.connect(owner).withdraw(amount);
    const withdrawalEvents = await vault.queryFilter(vault.filters.Withdrawn(owner.address));
    expect(withdrawalEvents).to.have.length(1);
    expect(withdrawalEvents[0].args.amount).to.equal(amount);
  });

  it('blocks withdrawals while the lock is active and allows them after maturity', async function () {
    const depositAmount = ethers.parseUnits('1500', 18);
    const withdrawAmount = ethers.parseUnits('500', 18);

    await vault.connect(owner).deposit(depositAmount);
    await vault.connect(owner).lock(ONE_DAY);

    await expect(vault.connect(owner).withdraw(withdrawAmount)).to.be.revertedWithCustomError(vault, 'LockActive');

    await time.increase(ONE_DAY + 1n);

    const beforeBalance = await usdt.balanceOf(owner.address);
    await vault.connect(owner).withdraw(withdrawAmount);

    expect(await vault.getBalance()).to.equal(depositAmount - withdrawAmount);
    expect(await usdt.balanceOf(owner.address)).to.equal(beforeBalance + withdrawAmount);
  });

  it('keeps newly deposited funds blocked until the initial lock expires', async function () {
    const initialDeposit = ethers.parseUnits('1200', 18);
    const extraDeposit = ethers.parseUnits('300', 18);

    await vault.connect(owner).deposit(initialDeposit);
    await vault.connect(owner).lock(ONE_DAY);
    await vault.connect(owner).deposit(extraDeposit);

    await expect(vault.connect(owner).withdraw(extraDeposit)).to.be.revertedWithCustomError(vault, 'LockActive');

    await time.increase(ONE_DAY + 1n);
    await vault.connect(owner).withdraw(initialDeposit + extraDeposit);

    expect(await vault.getBalance()).to.equal(0);
  });

  it('allows relocking after the previous lock expires', async function () {
    const initialDeposit = ethers.parseUnits('2000', 18);

    await vault.connect(owner).deposit(initialDeposit);
    await vault.connect(owner).lock(ONE_DAY);

    await time.increase(ONE_DAY + 1n);
    await vault.connect(owner).withdraw(ethers.parseUnits('500', 18));

    expect(await vault.isLockActive()).to.equal(false);
    expect(await vault.getTimeRemaining()).to.equal(0);

    await vault.connect(owner).lock(ONE_DAY);
    expect(await vault.isLockActive()).to.equal(true);
    expect(await vault.getUnlockTime()).to.be.greaterThan(await time.latest());
  });
});
