'use-strict';

const { Contract } = require('fabric-contract-api');

const balancePrefix = 'balance';
const allowancePrefix = 'allowance';
const nameKey = 'name';
const symbolKey = 'symbol';
const decimalsKey = 'decimals';
const totalSupplyKey = 'totalSupply';
const EVENT_NAME = 'chaincodeEvent';

class TokenERC20Contract extends Contract {

    async TokenName(ctx) {
        const nameBytes = await ctx.stub.getState(nameKey);
        return nameBytes.toString();
    }

    async Symbol(ctx) {
        const symbolBytes = await ctx.stub.getState(symbolKey);
        return symbolBytes.toString();
    }

    async Decimals(ctx) {
        const decimalBytes = await ctx.stub.getState(decimalsKey);
        const decimals = parseInt(decimalBytes.toString());
        return decimals;
    }

    async TotalSupply(ctx) {
        const totalSupplyBytes = await ctx.stub.getState(totalSupplyKey);
        const totalSupply = parseInt(totalSupplyBytes.toString());
        return totalSupply;
    }

    async BalanceOf(ctx, owner) {
        const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [owner]);
        const balanceBytes = await ctx.stub.getState(balanceKey);
        
        if (!balanceBytes || balanceBytes.length === 0) {
            throw new Error(`the account ${owner} does not exist`);
        }
        
        const balance = parseInt(balanceBytes.toString());

        return balance;
    }

    async Transfer(ctx, to, value) {
        const from = await this.ClientAccountID(ctx);
        const transferResp = await this._transfer(ctx, from, to, value);

        if (!transferResp) {
            throw new Error('Failed to transfer');
        }

        const transferEvent = { from, to, value: parseInt(value) };
        await ctx.stub.setEvent(EVENT_NAME, Buffer.from(JSON.stringify(transferEvent)));

        return true;
    }

    async TransferFrom(ctx, from, to, value) {
        const spender = await this.ClientAccountID(ctx);
        const allowanceKey = ctx.stub.createCompositeKey(allowancePrefix, [from, spender]);
        const currentAllowanceBytes = await ctx.stub.getState(allowanceKey);

        if (!currentAllowanceBytes || currentAllowanceBytes.length === 0) {
            throw new Error(`spender ${spender} has no allowance from ${from}`);
        }

        const currentAllowance = parseInt(currentAllowanceBytes.toString());
        const valueInt = parseInt(value);

        if (currentAllowance < valueInt) {
            throw new Error('The spender does not have enough allowance to spend.');
        }

        const transferResp = await this._transfer(ctx, from, to, value);

        if (!transferResp) {
            throw new Error('Failed to transfer');
        }

        const updatedAllowance = currentAllowance - valueInt;

        await ctx.stub.putState(allowanceKey, Buffer.from(updatedAllowance.toString()));

        console.log(`spender ${spender} allowance updated from ${currentAllowance} to ${updatedAllowance}`);

        const transferEvent = { from, to, value: valueInt };
        
        await ctx.stub.setEvent(EVENT_NAME, Buffer.from(JSON.stringify(transferEvent)));

        console.log('transferFrom ended successfully');

        return true;
    }

    async _transfer(ctx, from, to, value) {
        if (from === to) {
            throw new Error('cannot transfer to and from same client account');
        }

        const valueInt = parseInt(value);
        
        if (valueInt < 0) {
            throw new Error('transfer amount cannot be negative value');
        }

        const fromBalanceKey = ctx.stub.createCompositeKey(balancePrefix, [from]);
        const fromCurrentBalanceBytes = await ctx.stub.getState(fromBalanceKey);

        if (!fromCurrentBalanceBytes || fromCurrentBalanceBytes.length === 0) {
            throw new Error(`client account ${from} has no balance`);
        }

        const fromCurrentBalance = parseInt(fromCurrentBalanceBytes.toString());

        if (fromCurrentBalance < valueInt) {
            throw new Error(`client account ${from} has insufficient funds.`);
        }

        const toBalanceKey = ctx.stub.createCompositeKey(balancePrefix, [to]);
        const toCurrentBalanceBytes = await ctx.stub.getState(toBalanceKey);
        let toCurrentBalance;

        if (!toCurrentBalanceBytes || toCurrentBalanceBytes.length === 0) {
            toCurrentBalance = 0;
        } else {
            toCurrentBalance = parseInt(toCurrentBalanceBytes.toString());
        }

        const fromUpdatedBalance = fromCurrentBalance - valueInt;
        const toUpdatedBalance = toCurrentBalance + valueInt;

        await ctx.stub.putState(fromBalanceKey, Buffer.from(fromUpdatedBalance.toString()));
        await ctx.stub.putState(toBalanceKey, Buffer.from(toUpdatedBalance.toString()));

        console.log(`client ${from} balance updated from ${fromCurrentBalance} to ${fromUpdatedBalance}`);
        console.log(`recipient ${to} balance updated from ${toCurrentBalance} to ${toUpdatedBalance}`);

        return true;
    }

    async Approve(ctx, spender, value) {
        const owner = await this.ClientAccountID(ctx);
        const allowanceKey = ctx.stub.createCompositeKey(allowancePrefix, [owner, spender]);
        let valueInt = parseInt(value);
        await ctx.stub.putState(allowanceKey, Buffer.from(valueInt.toString()));
        const approvalEvent = { owner, spender, value: valueInt };
        await ctx.stub.setEvent(EVENT_NAME, Buffer.from(JSON.stringify(approvalEvent)));
        console.log('approve ended successfully');

        return true;
    }

    async Allowance(ctx, owner, spender) {
        const allowanceKey = ctx.stub.createCompositeKey(allowancePrefix, [owner, spender]);
        const allowanceBytes = await ctx.stub.getState(allowanceKey);

        if (!allowanceBytes || allowanceBytes.length === 0) {
            throw new Error(`spender ${spender} has no allowance from ${owner}`);
        }

        const allowance = parseInt(allowanceBytes.toString());

        return allowance;
    }

    async SetOption(ctx, name, symbol, decimals) {
        await ctx.stub.putState(nameKey, Buffer.from(name));
        await ctx.stub.putState(symbolKey, Buffer.from(symbol));
        await ctx.stub.putState(decimalsKey, Buffer.from(decimals));
        console.log(`name: ${name}, symbol: ${symbol}, decimals: ${decimals}`);

        return true;
    }

    async Mint(ctx, amount) {
        const clientMSPID = ctx.clientIdentity.getMSPID();

        if (clientMSPID !== 'Org1MSP') {
            throw new Error('client is not authorized to mint new tokens');
        }

        const minter = await this.ClientAccountID(ctx);
        const amountInt = parseInt(amount);

        if (amountInt <= 0) {
            throw new Error('mint amount must be positive integer');
        }

        const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [minter]);
        const currentBalanceBytes = await ctx.stub.getState(balanceKey);
        let currentBalance;

        if (!currentBalanceBytes || currentBalanceBytes.length === 0) {
            currentBalance = 0;
        } else {
            currentBalance = parseInt(currentBalanceBytes.toString());
        }

        const updatedBalance = currentBalance + amountInt;

        await ctx.stub.putState(balanceKey, Buffer.from(updatedBalance.toString()));

        const totalSupplyBytes = await ctx.stub.getState(totalSupplyKey);
        let totalSupply;

        if (!totalSupplyBytes || totalSupplyBytes.length === 0) {
            console.log('Initialize the tokenSupply');
            totalSupply = 0;
        } else {
            totalSupply = parseInt(totalSupplyBytes.toString());
        }

        totalSupply = totalSupply + amountInt;

        await ctx.stub.putState(totalSupplyKey, Buffer.from(totalSupply.toString()));

        const transferEvent = { from: '0x0', to: minter, value: amountInt };

        await ctx.stub.setEvent(EVENT_NAME, Buffer.from(JSON.stringify(transferEvent)));
        
        console.log(`minter account ${minter} balance updated from ${currentBalance} to ${updatedBalance}`);

        return true;
    }

    async Burn(ctx, amount) {
        const clientMSPID = ctx.clientIdentity.getMSPID();

        if (clientMSPID !== 'Org1MSP') {
            throw new Error('client is not authorized to burn old tokens');
        }

        const minter = await this.ClientAccountID(ctx);
        const amountInt = parseInt(amount);
        const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [minter]);
        const currentBalanceBytes = await ctx.stub.getState(balanceKey);
        if (!currentBalanceBytes || currentBalanceBytes.length === 0) {
            throw new Error('The balance does not exist');
        }

        const currentBalance = parseInt(currentBalanceBytes.toString());
        const updatedBalance = currentBalance - amountInt;

        await ctx.stub.putState(balanceKey, Buffer.from(updatedBalance.toString()));

        const totalSupplyBytes = await ctx.stub.getState(totalSupplyKey);

        if (!totalSupplyBytes || totalSupplyBytes.length === 0) {
            throw new Error('totalSupply does not exist');
        }

        const totalSupply = parseInt(totalSupplyBytes.toString()) - amountInt;

        await ctx.stub.putState(totalSupplyKey, Buffer.from(totalSupply.toString()));

        const transferEvent = { from: minter, to: '0x0', value: amountInt };

        await ctx.stub.setEvent(EVENT_NAME, Buffer.from(JSON.stringify(transferEvent)));
        
        console.log(`minter account ${minter} balance updated from ${currentBalance} to ${updatedBalance}`);

        return true;
    }

    async ClientAccountBalance(ctx) {
        const clientAccountID = await this.ClientAccountID(ctx);
        const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [clientAccountID]);
        const balanceBytes = await ctx.stub.getState(balanceKey);

        if (!balanceBytes || balanceBytes.length === 0) {
            throw new Error(`the account ${clientAccountID} does not exist`);
        }

        const balance = parseInt(balanceBytes.toString());

        return balance;
    }

    async ClientAccountID(ctx) {
        let id = [];
        id.push(ctx.clientIdentity.getID());
        var begin = id[0].indexOf("/CN=");
        var end = id[0].lastIndexOf("::/C=");
        let userid = id[0].substring(begin + 4, end);

        return userid;
    }

}

module.exports = TokenERC20Contract;