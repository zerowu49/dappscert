'use strict';

const { Contract } = require('fabric-contract-api');
const EVENT_NAME = 'chaincodeEvent';

class AssetTransfer extends Contract {

    async InitLedger(ctx) {
        const assets = [
            {
                ID: 'cert1',
                Title: 'AWS Cloud Practitioner',
                Owner: 'Adi',
                Issuer: "AWS",
            },
            {
                ID: 'cert2',
                Title: 'Cisco Certified Network Professional (CCNA)',
                Owner: 'Budi',
                Issuer: "Cisco",
            },
            {
                ID: 'cert3',
                Title: 'Certified Ethical Hacker (CEH)',
                Owner: 'Caca',
                Issuer: "EC Council",
            },
            {
                ID: 'cert4',
                Title: 'Associate Android Developer (AAD)',
                Owner: 'Doni',
                Issuer: "Android",
            },
        ];

        for (const asset of assets) {
            asset.docType = 'asset';
            await ctx.stub.putState(asset.ID, Buffer.from(JSON.stringify(asset)));
            console.info(`Asset ${asset.ID} initialized`);
        }
    }

    async CreateAsset(ctx, id, title, owner, issuer) {
        let userType = await this.getCurrentUserType(ctx);
        if (userType != "admin") {
            throw new Error(`This user does not have access to create an asset`);
        }
        const exists = await this.AssetExists(ctx, id);
        if (exists) {
            throw new Error(`The asset ${id} already exists`);
        }
        const asset = {
            ID: id,
            Title: title,
            Owner: owner,
            Issuer: issuer,
        };
        await ctx.stub.putState(id, Buffer.from(JSON.stringify(asset)));
        await ctx.stub.setEvent(EVENT_NAME, Buffer.from(JSON.stringify(asset)));
        
        return JSON.stringify(asset);
    }

    async ReadAsset(ctx, id) {
        const assetJSON = await ctx.stub.getState(id);
        if (!assetJSON || assetJSON.length === 0) {
            throw new Error(`The asset ${id} does not exist`);
        }
        return assetJSON.toString();
    }

    async UpdateAsset(ctx, id, title, owner, issuer) {
        let userType = await this.getCurrentUserType(ctx);
        if (userType != "admin") {
            throw new Error(`This user does not have access to update an asset`);
        }
        const exists = await this.AssetExists(ctx, id);
        if (!exists) {
            throw new Error(`The asset ${id} does not exist`);
        }
        const updatedAsset = {
            ID: id,
            Title: title,
            Owner: owner,
            Issuer: issuer,
        };
        await ctx.stub.putState(id, Buffer.from(JSON.stringify(updatedAsset)));
        await ctx.stub.setEvent(EVENT_NAME, Buffer.from(JSON.stringify(updatedAsset)));

        return true;
    }

    // async DeleteAsset(ctx, id) {
    //     let userType = await this.getCurrentUserType(ctx);
    //     if (userType != "admin") {
    //         throw new Error(`This user does not have access to delete an asset`);
    //     }
    //     const exists = await this.AssetExists(ctx, id);
    //     if (!exists) {
    //         throw new Error(`The asset ${id} does not exist`);
    //     }
    //     await ctx.stub.deleteState(id);
    //     await ctx.stub.setEvent(EVENT_NAME, Buffer.from(JSON.stringify({ID: id})));
        
    //     return true;
    // }

    async AssetExists(ctx, id) {
        const assetJSON = await ctx.stub.getState(id);
        return assetJSON && assetJSON.length > 0;
    }

    // async TransferAsset(ctx, id, newOwner) {
    //     let userType = await this.getCurrentUserType(ctx);
    //     if (userType != "admin") {
    //         throw new Error(`This user does not have access to transfer an asset`);
    //     }
    //     const assetString = await this.ReadAsset(ctx, id);
    //     const asset = JSON.parse(assetString);
    //     asset.Owner = newOwner;
    //     await ctx.stub.putState(id, Buffer.from(JSON.stringify(asset)));
    //     await ctx.stub.setEvent(EVENT_NAME, Buffer.from(JSON.stringify(asset)));
        
    //     return true;
    // }

    async GetAllAssets(ctx) {
        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        while (!result.done) {
            const strValue = result.value.value.toString('utf8');
            let record;
            try {
                record = JSON.parse(strValue);
            } catch (err) {
                console.log(err);
                record = strValue;
            }
            allResults.push({ Key: result.value.key, Record: record });
            result = await iterator.next();
        }
        
        return JSON.stringify(allResults);
    }

    async GetAssetHistory(ctx, id) {
        const exists = await this.AssetExists(ctx, id);
        if (!exists) {
            throw new Error(`The asset ${id} does not exist`);
        }
        
        const allResults = [];
        const iterator = await ctx.stub.getHistoryForKey(id);
        
        while (true) {
            console.log('Masuk GetAssetHistory');
            let result = await iterator.next();

            if (result.value && result.value.value.toString()) {
                let record = {};
                record.TxId = result.value.tx_id;
                record.IsDelete = result.value.is_delete.toString();
                let d = new Date(0);
                d.setUTCSeconds(result.value.timestamp.seconds.low);
                record.Timestamp = d.toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
                
                const strValue = result.value.value.toString('utf8');
                try {
                    record.Value = JSON.parse(strValue);
                } catch (err) {
                    console.log(err);
                    record.Value = strValue;
                }
                allResults.push(record);
            }

            if (result.done) {
                await iterator.close();
                return JSON.stringify(allResults);
            }
        }
    }

    async getCurrentUserId(ctx) {
        let id = [];
        id.push(ctx.clientIdentity.getID());
        var begin = id[0].indexOf("/CN=");
        var end = id[0].lastIndexOf("::/C=");
        let userid = id[0].substring(begin + 4, end);
        
        return userid;
    }

    async getCurrentUserType(ctx) {
        let userid = await this.getCurrentUserId(ctx);
        console.log('userid', userid);
        if (userid == "admin" || userid == "Admin@org1.example.com" || userid == "Admin@org2.example.com") {
            return "admin";
        }
        
        return ctx.clientIdentity.getAttributeValue("usertype");
    }
}

module.exports = AssetTransfer;