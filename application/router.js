'use strict';
const express = require('express');
const utils = require('./utils.js');
const sampleNetworkRouter = express.Router();

const STATUS_SUCCESS = 200;
const STATUS_CLIENT_ERROR = 400;
const STATUS_SERVER_ERROR = 500;
const USER_NOT_ENROLLED = 1000;
const INVALID_HEADER = 1001;

async function getUsernamePassword(request) {
    if (!request.headers.authorization || request.headers.authorization.indexOf('Basic ') === -1) {
        return new Promise((resolve,reject)=> {
            reject('Missing Authorization Header')
        });
    }

    const base64Credentials = request.headers.authorization.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    if (!username || !password) {
        return new Promise((resolve,reject) => {
            reject('Invalid Authentication Credentials')
        });
    }

    request.username = username;
    request.password = password;

    return request;
}

async function submitTx(request, txName, ...args) {
    try {
        await getUsernamePassword(request);
        return utils.setUserContext(request.username, request.password).then((contract) => {
            args.unshift(txName);
            args.unshift(contract);
            return utils.submitTx.apply("unused", args).then(buffer => {
                console.log("saya jalan",buffer)
                return buffer;
            }, error => {
                console.log("saya error",error)
                return Promise.reject(error);
            });
        }, error => {
            return Promise.reject(error);
        });
    } catch (error) {
        return Promise.reject(error);
    }
}

async function evalTx(request, txName, ...args) {
    try {
        await getUsernamePassword(request);
        return utils.setUserContext(request.username, request.password).then((contract) => {
            args.unshift(txName);
            args.unshift(contract);
            return utils.evalTx.apply("unused", args).then(buffer => {
                return buffer;
            }, error => {
                return Promise.reject(error);
            });
        }, error => {
            return Promise.reject(error);
        });
    } catch (error) {
        return Promise.reject(error);
    }
}

sampleNetworkRouter.route('/assets').get(function (request, response) {
    evalTx(request, 'GetAllAssets').then((result) => {
        response.status(STATUS_SUCCESS);
        response.send(JSON.parse(result));
    }, (error) => {
        response.status(STATUS_SERVER_ERROR);
        response.send(utils.prepareErrorResponse(error, STATUS_SERVER_ERROR,
            "There was a problem getting the list of assets."));
    });
});

sampleNetworkRouter.route('/assets/:id').get(function (request, response) {
    evalTx(request, 'ReadAsset', request.params.id).then((result) => {
        response.status(STATUS_SUCCESS);
        response.send(JSON.parse(result));
    }, (error) => {
        response.status(STATUS_SERVER_ERROR);
        response.send(utils.prepareErrorResponse(error, STATUS_SERVER_ERROR,
            'Asset ID, ' + request.params.id +
            ' does not exist or the user does not have access to asset details at this time.'));
    });
});

sampleNetworkRouter.route('/create-asset').post(function (request, response) {
    submitTx(request, 
        'CreateAsset', 
        request.body.id, 
        request.body.title, 
        request.body.owner, 
        request.body.issuer).then((result) => {
        response.status(STATUS_SUCCESS);
        response.send(JSON.parse(result));
    }, (error) => {
        console.log("appraisedValue: ",request.body.appraisedValue)
        response.status(STATUS_SERVER_ERROR);
        response.send(utils.prepareErrorResponse(error, STATUS_SERVER_ERROR,
            "There was a problem creating the asset."));
    });
});

sampleNetworkRouter.route('/asset-history/:id').get(function (request, response) {
    evalTx(request, 'GetAssetHistory', request.params.id).then((result) => {
        response.status(STATUS_SUCCESS);
        response.send(JSON.parse(result));
    }, (error) => {
        response.status(STATUS_SERVER_ERROR);
        response.send(utils.prepareErrorResponse(error, STATUS_SERVER_ERROR,
            "There was a problem fetching history for asset, ", request.params.id));
    });
});

sampleNetworkRouter.route('/update-asset').put(function (request, response) {
    submitTx(request, 'UpdateAsset', 
    request.body.id, 
    request.body.title, 
    request.body.owner, 
    request.body.issuer).then((result) => {
        response.status(STATUS_SUCCESS);
        response.send(result);
    }, (error) => {
        response.status(STATUS_SERVER_ERROR);
        response.send(utils.prepareErrorResponse(error, STATUS_SERVER_ERROR,
            "There was a problem in updating asset, ", request.params.id));
    });
});

sampleNetworkRouter.route('/transfer-asset').put(function (request, response) {
    submitTx(request, 'TransferAsset', request.body.id, request.body.owner).then((result) => {
        response.status(STATUS_SUCCESS);
        response.send(result);
    }, (error) => {
        response.status(STATUS_SERVER_ERROR);
        response.send(utils.prepareErrorResponse(error, STATUS_SERVER_ERROR,
            "There was a problem in transferring asset, ", request.params.id));
    });
});

sampleNetworkRouter.route('/delete-asset/:id').delete(function (request, response) {
    submitTx(request, 'DeleteAsset', request.params.id).then((result) => {
        response.status(STATUS_SUCCESS);
        response.send(result);
    }, (error) => {
        response.status(STATUS_SERVER_ERROR);
        response.send(utils.prepareErrorResponse(error, STATUS_SERVER_ERROR,
            "There was a problem in deleting asset, " + request.params.id));
    });
});

sampleNetworkRouter.route('/register-user').post(function (request, response) {
    try {
        let userId = request.body.userid;
        let userPwd = request.body.password;
        let userType = request.body.usertype;

        getUsernamePassword(request).then(request => {
            utils.registerUser(userId, userPwd, userType, request.username).then((result) => {
                response.status(STATUS_SUCCESS);
                response.send(result);
            }, (error) => {
                response.status(STATUS_CLIENT_ERROR);
                response.send(utils.prepareErrorResponse(error, STATUS_CLIENT_ERROR,
                    "User, " + userId + " could not be registered. "
                    + "Verify if calling identity has admin privileges."));
            });
        }, error => {
            response.status(STATUS_CLIENT_ERROR);
            response.send(utils.prepareErrorResponse(error, INVALID_HEADER,
                "Invalid header;  User, " + userId + " could not be registered."));
        });
    } catch (error) {
        response.status(STATUS_SERVER_ERROR);
        response.send(utils.prepareErrorResponse(error, STATUS_SERVER_ERROR,
            "Internal server error; User, " + userId + " could not be registered."));
    }
});

sampleNetworkRouter.route('/enroll-user/').post(function (request, response) {
    let userType = request.body.usertype;
    getUsernamePassword(request).then(request => {
        utils.enrollUser(request.username, request.password, userType).then(result => {
            response.status(STATUS_SUCCESS);
            response.send(result);
        }, error => {
            response.status(STATUS_CLIENT_ERROR);
            response.send(utils.prepareErrorResponse(error, STATUS_CLIENT_ERROR,
                "User, " + request.username + " could not be enrolled. Check that user is registered."));
        });
    }), (error => {
        response.status(STATUS_CLIENT_ERROR);
        response.send(utils.prepareErrorResponse(error, INVALID_HEADER, "Invalid header."));
    });
});

sampleNetworkRouter.route('/is-user-enrolled/:id').get(function (request, response) {
    getUsernamePassword(request).then(request => {
        let userId = request.params.id;
        utils.isUserEnrolled(userId).then(result => {
            response.status(STATUS_SUCCESS);
            response.send(result);
        }, error => {
            response.status(STATUS_CLIENT_ERROR);
            response.send(utils.prepareErrorResponse(error, STATUS_CLIENT_ERROR,
                "Error checking enrollment for user, " + request.params.id));
        });
    }, ((error) => {
        response.status(STATUS_CLIENT_ERROR);
        response.send(utils.prepareErrorResponse(error, INVALID_HEADER,
            "Invalid header; Error checking enrollment for user, " + request.params.id));
    }));
});

sampleNetworkRouter.route('/users').get(function (request, response) {
    getUsernamePassword(request).then(request => {
        utils.getAllUsers(request.username).then((result) => {
            response.status(STATUS_SUCCESS);
            response.send(result);
        }, (error) => {
            response.status(STATUS_SERVER_ERROR);
            response.send(utils.prepareErrorResponse (error, STATUS_SERVER_ERROR,
                "Problem getting list of users."));
        });
    }, ((error) => {
        response.status(STATUS_CLIENT_ERROR);
        response.send(utils.prepareErrorResponse(error, INVALID_HEADER,
            "Invalid header."));
    }));
});

sampleNetworkRouter.route('/users/:id').get(function (request, response) {
    getUsernamePassword(request).then(request => {
        utils.isUserEnrolled(request.params.id).then(result1 => {
            if (result1 == true) {
                utils.getUser(request.params.id, request.username).then((result2) => {
                    response.status(STATUS_SUCCESS);
                    response.send(result2);
                }, (error) => {
                    response.status(STATUS_SERVER_ERROR);
                    response.send(utils.prepareErrorResponse(error, STATUS_SERVER_ERROR,
                        "Could not get user details for user, " + request.params.id));
                });
            } else {
                let error = {};
                response.status(STATUS_CLIENT_ERROR);
                response.send(utils.prepareErrorResponse(error, USER_NOT_ENROLLED,
                    "Verify if the user is registered and enrolled."));
            }
        }, error => {
            response.status(STATUS_SERVER_ERROR);
            response.send(utils.prepareErrorResponse(error, STATUS_SERVER_ERROR,
                "Problem checking for user enrollment."));
        });
    }, ((error) => {
        response.status(STATUS_CLIENT_ERROR);
        response.send(utils.prepareErrorResponse(error, INVALID_HEADER,
            "Invalid header."));
    }));
});

module.exports = sampleNetworkRouter;