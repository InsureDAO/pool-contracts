// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "./AaveV3StrategySetUp.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract WhenUtilizeVaultAsset is AaveV3StrategySetUp {
    using SafeERC20 for IERC20;

    function testVaultBalanceIncreasedAndAdjust() public {
        assertEq(strategy.managingFund(), 900 * 1e6); // 10% of available asset(without debt)
        assertEq(vault.balance(), 9_100 * 1e6); // without managing fund
        assertEq(vault.available(), 8_100 * 1e6); // 10_000 - 1_000(debt for alice) - 900(strategy managing fund)

        vm.prank(dealer);
        vault.addValue(12_000 * 1e6, dealer, address(0));
        vm.prank(alice);
        vault.borrowValue(1_000 * 1e6, alice);
        /**
         * current vault balance: 21_100 = 9_100 + 12_000
         * current available asset: 19_100 = 21_100 - 2_000(debt)
         * current vault freeable asset(without debt but include managing fund): 20_000 = available asset(19_100) + 900(managing fund)
         * current strategy managing fund shortage: 1_100 = 10% of freeable(2_000) - managing fund(900)
         */
        strategy.adjustFund(); // pull fund to cover shortage(1_100)
        assertEq(strategy.managingFund(), 2_000 * 1e6);
        assertEq(vault.available(), 18_000 * 1e6); // available asset(19_100) - pulled fund(1_100)
        assertEq(vault.balance(), 20_000 * 1e6); // balance(21_100) - pulled fund(1_100)

        skip(1e6);
        uint256 _claimableReward = strategy.getUnclaimedReward();
        uint256 _expectedCompoundUsdc = exchangeLogic.estimateAmountOut(aaveRewardToken, usdc, _claimableReward);
        vm.prank(gelatoOps);
        strategy.compound();
        assertEq(strategy.managingFund(), 2_000 * 1e6 + _expectedCompoundUsdc);
    }

    function testVaultBalanceIncreasedAndAdjustFuzzing(uint256 _newValueAdded) public {
        uint256 _aaveSupplyCap = (IERC20(ausdc).totalSupply() * strategy.aaveMaxOccupancyRatio()) / 1e6;
        vm.assume(_newValueAdded < _aaveSupplyCap);
        uint256 _newValueBorrowed = _newValueAdded % 10;

        deal(usdc, dealer, _newValueAdded);
        deal(usdc, alice, _newValueBorrowed);

        vm.prank(dealer);
        vault.addValue(_newValueAdded, dealer, address(0));
        vm.prank(alice);
        vault.borrowValue(_newValueBorrowed, alice);

        uint256 _preBalance = vault.balance();
        uint256 _preManagingFund = strategy.managingFund();
        uint256 _preAvailableVaultFund = vault.available();

        uint256 _expectedManagingFund = ((_preAvailableVaultFund + _preManagingFund) * strategy.maxManagingRatio()) /
            1e6;
        uint256 _shortage = _expectedManagingFund - _preManagingFund;

        strategy.adjustFund();

        assertEq(strategy.managingFund(), _expectedManagingFund);
        assertEq(vault.available(), _preAvailableVaultFund - _shortage);
        assertEq(vault.balance(), _preBalance - _shortage);
    }

    function testVaultBalanceDecreasedAndAdjust() public {
        assertEq(strategy.managingFund(), 900 * 1e6); // 10% of available asset(without debt)
        assertEq(vault.balance(), 9_100 * 1e6); // without managing fund
        assertEq(vault.available(), 8_100 * 1e6); // 10_000 - 1_000(debt for alice) - 900(strategy managing fund)

        vm.prank(dealer);
        vault.withdrawValue(4_000 * 1e6, dealer);

        /**
         * current vault balance: 5_100 = 9_100 - 4_000
         * current available asset: 4_100 = 5_100 - 1_000(debt)
         * current vault freeable asset(without debt but include managing fund): 6_000 = 5_100(available asset) + 900(strategy)
         * current strategy managing fund shortage: -300 = 600(10% of freeable) - managing fund(900)
         */
        strategy.adjustFund(); // do nothing
        assertEq(strategy.managingFund(), 900 * 1e6); // no change
        assertEq(vault.available(), 4_100 * 1e6); // no change
        assertEq(vault.balance(), 5_100 * 1e6); // no change

        skip(1e6);
        uint256 _claimableReward = strategy.getUnclaimedReward();
        uint256 _expectedCompoundUsdc = exchangeLogic.estimateAmountOut(aaveRewardToken, usdc, _claimableReward);
        vm.prank(gelatoOps);
        strategy.compound();
        assertEq(strategy.managingFund(), 900 * 1e6 + _expectedCompoundUsdc);
    }

    function testVaultBalanceDecreasedAndAdjustFuzzing(uint256 _valueWithdrawn) public {
        vm.assume(_valueWithdrawn < vault.available());
        vm.assume(_valueWithdrawn > 0);

        vm.prank(dealer);
        vault.withdrawValue(_valueWithdrawn, dealer);

        uint256 _preBalance = vault.balance();
        uint256 _preManagingFund = strategy.managingFund();
        uint256 _preAvailableVaultFund = vault.available();

        strategy.adjustFund(); // do nothing

        assertEq(strategy.managingFund(), _preManagingFund); // no change
        assertEq(vault.available(), _preAvailableVaultFund); // no change
        assertEq(vault.balance(), _preBalance); // no change
    }

    function testMaxManagingRatioIncreasedAndAdjust(uint256 _newRatio) public {
        uint256 _currentRatio = strategy.maxManagingRatio();
        vm.assume(_newRatio <= 1e6);
        vm.assume(_newRatio > _currentRatio);
        vm.prank(deployer);
        strategy.setMaxManagingRatio(_newRatio);

        uint256 _preManagingFund = strategy.managingFund();
        uint256 _expectedManagingFund = (_newRatio * (vault.available() + _preManagingFund)) / 1e6;
        strategy.adjustFund();

        assertEq(strategy.managingFund(), _expectedManagingFund);
    }

    function testMaxManagingRatioDecreasedAndAdjust(uint256 _newRatio) public {
        uint256 _currentRatio = strategy.maxManagingRatio();
        vm.assume(_newRatio <= 1e6);
        vm.assume(_newRatio < _currentRatio);
        vm.assume(_newRatio > 0);
        vm.prank(deployer);
        strategy.setMaxManagingRatio(_newRatio);

        uint256 _preManagingFund = strategy.managingFund();
        strategy.adjustFund(); // no change

        assertEq(strategy.managingFund(), _preManagingFund);
    }

    function testAaveV3ContractUnavailableAndAdjust() public {
        vm.startPrank(deployer);
        vault = new Vault(usdc, address(registry), address(0), address(ownership));
        strategy = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(address(1)),
            IAaveV3Reward(address(1)),
            IERC20(usdc),
            IERC20(ausdc),
            IERC20(aaveRewardToken),
            gelatoOps
        );

        vault.setController(address(strategy));
        vm.stopPrank();

        // approve unlimited transfer
        vm.prank(dealer);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(alice);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(bob);
        IERC20(usdc).approve(address(vault), type(uint256).max);

        vm.prank(dealer);
        vault.addValue(10_000 * 1e6, dealer, dealer);
        vm.prank(alice);
        vault.borrowValue(1_000 * 1e6, alice);

        // set managing fund ratio
        vm.prank(deployer);
        strategy.setMaxManagingRatio(1e5); // 10%

        vm.expectRevert();
        strategy.adjustFund();

        // if aave contract reverted, no fund pulled to strategy
        assertEq(vault.balance(), 10_000 * 1e6);
        assertEq(strategy.managingFund(), 0);
    }

    function testUsdcSentByMaliciousSender(uint256 _amount) public {
        vm.assume(_amount > 0);
        vm.assume(_amount <= 1e18);
        deal(usdc, bob, _amount);

        vm.prank(bob);
        IERC20(usdc).safeTransfer(address(strategy), _amount);

        /**
         * current status
         * vault available fund: 8_100
         * strategy managing fund: 900
         * strategy usdc balance: _amount + 900
         */

        vm.prank(deployer);
        strategy.setMaxManagingRatio(2e5); // 20%

        strategy.adjustFund();
        /**
         * sent usdc does not affect fund adjustment
         */
        assertEq(vault.available(), 7_200 * 1e6);
        assertEq(strategy.managingFund(), 1_800 * 1e6);
    }
}

contract WhenUnutilizeStrategyAsset is AaveV3StrategySetUp {
    function testVaultHasNotEnoughBalance() public {
        vm.prank(dealer);
        vault.withdrawValue(9_000 * 1e6, dealer);

        assertEq(vault.balance(), 1_000 * 1e6);
        assertEq(vault.available(), 0);
        // shortage covered by the controller
        assertEq(strategy.managingFund(), 0);
    }

    function testVaultAndStrategyHasNotEnoughBalance() public {
        vm.prank(dealer);
        // the controller cannot cover shortage
        vm.expectRevert(InsufficientManagingFund.selector);
        vault.withdrawValue(10_000 * 1e6, dealer);

        // vault and strategy asset is not changed
        assertEq(vault.balance(), 9_100 * 1e6);
        assertEq(vault.available(), 8_100 * 1e6);
        assertEq(strategy.managingFund(), 900 * 1e6);
    }
}

contract WhenCompoundAaveReward is AaveV3StrategySetUp {
    function testCompoundedRewardExceedMaxManagingRatio(uint256 _time) public {
        vm.assume(_time > 60);
        vm.assume(_time <= 3e8); // approximately 10 years
        skip(_time);
        uint256 _preManagingFund = strategy.managingFund();
        uint256 _unclaimedReward = strategy.getUnclaimedReward();
        uint256 _expectedUsdcOut = exchangeLogic.estimateAmountOut(aaveRewardToken, usdc, _unclaimedReward);
        vm.prank(gelatoOps);
        strategy.compound();

        assertEq(strategy.managingFund(), _preManagingFund + _expectedUsdcOut);
    }

    function testCompoundedRewardExceedAaveSupplyingRatio() public {
        uint256 _aaveSupplyThreshold = (IERC20(ausdc).totalSupply() * strategy.aaveMaxOccupancyRatio()) / 1e6;
        // calculate value that is nealy equal to the capacity
        uint256 _addAmount = (_aaveSupplyThreshold * 9e5) / strategy.maxManagingRatio();
        deal(usdc, dealer, _addAmount);

        vm.prank(dealer);
        vault.addValue(_addAmount, dealer, dealer);
        strategy.adjustFund();

        vm.prank(deployer);
        skip(1e6);
        uint256 _unclaimedReward = strategy.getUnclaimedReward();
        uint256 _estimatedUsdcAmount = exchangeLogic.estimateAmountOut(aaveRewardToken, usdc, _unclaimedReward);
        uint256 _totalSupply = IERC20(ausdc).totalSupply();
        uint256 _currentSupply = IERC20(ausdc).balanceOf(address(strategy));
        uint256 _expectedSupplyRatio = ((_estimatedUsdcAmount + _currentSupply) * 1e6) / _totalSupply;

        vm.prank(deployer);
        strategy.setAaveMaxOccupancyRatio(5e4); // 5%

        // new supply exceeds limit
        assertGt(_expectedSupplyRatio, strategy.aaveMaxOccupancyRatio());

        vm.prank(gelatoOps);
        // compound should be reverted
        vm.expectRevert(AaveSupplyCapExceeded.selector);
        strategy.compound();

        // unclaimed reward stil exist
        assertEq(strategy.getUnclaimedReward(), _unclaimedReward);
    }

    function testAaveRewardContractUnavailable() public {
        vm.startPrank(deployer);
        vault = new Vault(usdc, address(registry), address(0), address(ownership));
        strategy = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(aavePool),
            IAaveV3Reward(address(1)), // set unavailable contract address
            IERC20(usdc),
            IERC20(ausdc),
            IERC20(aaveRewardToken),
            gelatoOps
        );

        vault.setController(address(strategy));
        vm.stopPrank();

        // approve unlimited transfer
        vm.prank(dealer);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(alice);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(bob);
        IERC20(usdc).approve(address(vault), type(uint256).max);

        vm.prank(dealer);
        vault.addValue(10_000 * 1e6, dealer, dealer);
        vm.prank(alice);
        vault.borrowValue(1_000 * 1e6, alice);

        vm.prank(deployer);
        strategy.setMaxManagingRatio(1e5); // 10%

        strategy.adjustFund();

        assertEq(vault.balance(), 9_100 * 1e6);
        assertEq(strategy.managingFund(), 900 * 1e6);

        skip(1e6);
        vm.prank(gelatoOps);
        vm.expectRevert();
        strategy.compound();

        // vault and strategy balance has no change
        assertEq(vault.balance(), 9_100 * 1e6);
        assertEq(strategy.managingFund(), 900 * 1e6);
    }

    function testExchangeLogicUnavailable() public {
        vm.startPrank(deployer);
        vault = new Vault(usdc, address(registry), address(0), address(ownership));
        strategy = new AaveV3Strategy(
            ownership,
            vault,
            new ExchangeLogicUniswapV3(address(1), address(2), 3_000, 975_000), // set unavailable contract address
            IAaveV3Pool(aavePool),
            IAaveV3Reward(aaveReward),
            IERC20(usdc),
            IERC20(ausdc),
            IERC20(aaveRewardToken),
            gelatoOps
        );

        vault.setController(address(strategy));
        vm.stopPrank();

        // approve unlimited transfer
        vm.prank(dealer);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(alice);
        IERC20(usdc).approve(address(vault), type(uint256).max);
        vm.prank(bob);
        IERC20(usdc).approve(address(vault), type(uint256).max);

        vm.prank(dealer);
        vault.addValue(10_000 * 1e6, dealer, dealer);
        vm.prank(alice);
        vault.borrowValue(1_000 * 1e6, alice);

        vm.prank(deployer);
        strategy.setMaxManagingRatio(1e5); // 10%

        strategy.adjustFund();

        skip(1e6);
        uint256 _unclaimedReward = strategy.getUnclaimedReward();
        vm.prank(gelatoOps);
        vm.expectRevert();
        strategy.compound();
        assertEq(strategy.getUnclaimedReward(), _unclaimedReward);
    }
}

contract WhenMigrateAsset is AaveV3StrategySetUp {
    using SafeERC20 for IERC20;

    IController private newController;

    function setUp() public {
        newController = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(aavePool),
            IAaveV3Reward(aaveReward),
            IERC20(usdc),
            IERC20(ausdc),
            IERC20(aaveRewardToken),
            gelatoOps
        );
    }

    function testMigrateWithUnrecordedBalance() public {
        assertEq(strategy.managingFund(), 900 * 1e6);
        vm.prank(bob);
        IERC20(usdc).safeTransfer(address(strategy), 10_000 * 1e6);

        vm.prank(deployer);
        vault.setController(address(newController));

        assertEq(strategy.managingFund(), 0);
        assertEq(newController.managingFund(), 900 * 1e6);
    }

    function testMaxManagingRatioDifferent() public {
        vm.startPrank(deployer);
        newController.setMaxManagingRatio(5e4); // 5%
        vault.setController(address(newController));
        vm.stopPrank();

        assertEq(strategy.managingFund(), 0);
        assertEq(newController.managingFund(), 900 * 1e6); // migrate all assets regardless max managing ratio
    }

    function testUnclaimedRewardRemaining() public {
        skip(1e6);
        // unclaimed reward remaining
        assertGt(strategy.getUnclaimedReward(), 0);

        vm.prank(deployer);
        vault.setController(address(newController));

        // no reward claimable(everything compounded)
        assertEq(strategy.getUnclaimedReward(), 0);
    }

    function testAaveContractUnavailable() public {
        vm.startPrank(deployer);
        // vault = new Vault(usdc, address(registry), address(0), address(ownership));
        newController = new AaveV3Strategy(
            ownership,
            vault,
            exchangeLogic,
            IAaveV3Pool(address(1)),
            IAaveV3Reward(address(1)), // set unavailable contract address
            IERC20(usdc),
            IERC20(ausdc),
            IERC20(aaveRewardToken),
            gelatoOps
        );

        vm.expectRevert();
        vault.setController(address(newController));
        vm.stopPrank();

        // controller is not changed
        assertEq(address(vault.controller()), address(strategy));
        // fund is not moved
        assertEq(strategy.managingFund(), 900 * 1e6);
        assertEq(IERC20(ausdc).balanceOf(address(strategy)), 900 * 1e6);
        assertEq(newController.managingFund(), 0);
        assertEq(IERC20(ausdc).balanceOf(address(newController)), 0);

        // owner can only moved asset to specific address
        vm.prank(deployer);
        strategy.emergencyExit(alice);

        assertEq(strategy.managingFund(), 0);
        assertEq(IERC20(ausdc).balanceOf(address(strategy)), 0);
        assertEq(IERC20(ausdc).balanceOf(alice), 900 * 1e6);
    }
}

contract WhenCreateTaskOnGelatoOps is AaveV3StrategySetUp {
    /**
     * @notice Actually, we are going to use Gelato Ops UI to create tasks.
     */
    address private constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    function testExecuteTaskUsingGelatoOps() public {
        // set up
        vm.prank(deployer);
        strategy.setMinCompoundLimit(1);

        IOps _gelatoOps = IOps(gelatoOps);
        ITaskTreasury _taskTreasury = ITaskTreasury(gelatoTaskTreasury);

        // deposit fund to treasury
        deal(alice, 2 ether);
        vm.prank(alice);
        _taskTreasury.depositFunds{value: 1 ether}(alice, ETH, 1 ether);

        bytes memory _resolverData = abi.encodeWithSelector(strategy.check.selector);
        bytes memory _execData = abi.encodeWithSelector(strategy.compound.selector);
        bytes32 _resolverHash = keccak256(abi.encode(address(strategy), _resolverData));

        // create task
        vm.prank(alice);
        _gelatoOps.createTask(address(strategy), strategy.compound.selector, address(strategy), _resolverData);
        skip(1e6);

        // gelato ops executes task
        vm.prank(gelatoNetwork);
        _gelatoOps.exec(0.01 ether, ETH, alice, true, true, _resolverHash, address(strategy), _execData);

        assertEq(strategy.getUnclaimedReward(), 0);
    }
}

interface ITaskTreasury {
    /// @notice Function to deposit Funds which will be used to execute transactions on various services
    /// @param _receiver Address receiving the credits
    /// @param _token Token to be credited, use "0xeeee...." for ETH
    /// @param _amount Amount to be credited
    function depositFunds(
        address _receiver,
        address _token,
        uint256 _amount
    ) external payable;
}

interface IOps {
    /// @notice Create a task that tells Gelato to monitor and execute transactions on specific contracts
    /// @dev Requires funds to be added in Task Treasury, assumes treasury sends fee to Gelato via Ops
    /// @param _execAddress On which contract should Gelato execute the transactions
    /// @param _execSelector Which function Gelato should execute on the _execAddress
    /// @param _resolverAddress On which contract should Gelato check when to execute the tx
    /// @param _resolverData Which data should be used to check on the Resolver when to execute the tx
    function createTask(
        address _execAddress,
        bytes4 _execSelector,
        address _resolverAddress,
        bytes calldata _resolverData
    ) external returns (bytes32 task);

    /// @notice Execution API called by Gelato
    /// @param _txFee Fee paid to Gelato for execution, deducted on the TaskTreasury
    /// @param _feeToken Token used to pay for the execution. ETH = 0xeeeeee...
    /// @param _taskCreator On which contract should Gelato check when to execute the tx
    /// @param _useTaskTreasuryFunds If msg.sender's balance on TaskTreasury should pay for the tx
    /// @param _revertOnFailure To revert or not if call to execAddress fails
    /// @param _execAddress On which contract should Gelato execute the tx
    /// @param _execData Data used to execute the tx, queried from the Resolver by Gelato
    function exec(
        uint256 _txFee,
        address _feeToken,
        address _taskCreator,
        bool _useTaskTreasuryFunds,
        bool _revertOnFailure,
        bytes32 _resolverHash,
        address _execAddress,
        bytes calldata _execData
    ) external;

    /// @notice Returns TaskId of a task Creator
    /// @param _taskCreator Address of the task creator
    /// @param _execAddress Address of the contract to be executed by Gelato
    /// @param _selector Function on the _execAddress which should be executed
    /// @param _useTaskTreasuryFunds If msg.sender's balance on TaskTreasury should pay for the tx
    /// @param _feeToken FeeToken to use, address 0 if task treasury is used
    /// @param _resolverHash hash of resolver address and data
    function getTaskId(
        address _taskCreator,
        address _execAddress,
        bytes4 _selector,
        bool _useTaskTreasuryFunds,
        address _feeToken,
        bytes32 _resolverHash
    ) external pure returns (bytes32);
}
