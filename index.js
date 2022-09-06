const express = require("express");
const bunyan = require("bunyan");
const session = require("express-session");
const nunjucks = require('nunjucks')
const config = require('./config');
const duo_api = require('@duosecurity/duo_api');
const { EventEmitter } = require("events");

class AuthFlow {
    #res;
    #client;
    constructor(client, username, res){
        this.username = username;
        this.#res = res;
        this.currData = null;
        this.state = 'preAuth';
        this.#client = client;
    }

    #updateFlow = (data, state, callback) => {
        this.currData = data;
        this.state = state;
        callback();
    }

    startAuth = () => {
        this.client.jsonApiCall('POST', '/auth/v2/preauth', {username : this.username}, (data) => {this.updateFlow(data, 'sendPush', this.sendPush)});
    }

    #sendPush = () => {
        const devices = this.currData.response?.devices[0]

        if (devices.capabilities.indexOf('push') !== -1 && this.currData?.stat === 'OK'){
            this.client.jsonApiCall('POST', '/auth/v2/auth', {username: this.username, factor: 'auto', device: 'auto', type : 'Remote security challenge', pushinfo: 'from=Demo%20Challenge&domain=test.com&reason=approval%20for%20action'}, (data) => {this.updateFlow(data, 'awaitPush', this.procResult)});
    }
}

    #procResult = () => {
        if (this.currData?.response?.result === 'allow' && this.state === 'awaitPush') {
            this.res.render('success.html', {message: 'Challenge Approved'});
        } else {
            this.res.render('success.html', {message: 'Challenge Denied'});
        }
    }
}

class MultiAuthFlow extends EventEmitter{
    #res;
    #client;
    constructor(client, usernames, threshold, res){
        super();
        this.usernames = usernames;
        this.#res = res;
        this.currData = this.#initMultiState(usernames, null);
        this.state = this.#initMultiState(usernames, 'preAuth');
        this.#client = client;
        this.threshold = threshold;
        this.approved = [];
        this.denied = [];
        this.on("Approval", (user) => {
            console.log(user, " Success ");
            this.approved.push(user);
            if (this.approved.length >= this.threshold) {
                this.emit('Finished', true);
            }
        });

        this.on("Denial", (user) => {
            console.log(user, " Denied ");
            this.denied.push(user);
            if (this.threshold > (this.usernames.length - this.denied.length)) {
                this.emit('Finished', false)
            }
        });

        this.once('Finished', (result) => {
            if(result) {
                this.#res.render('success.html', {message: `Success: Approved by ${this.approved.length}; required ${this.threshold}`});
                return;
            }
            this.#res.render('success.html', {message: `Failure: Denied by ${this.denied.length} of ${this.usernames.length}; required ${this.threshold} cannot be met.`});
        });
    }

    #initMultiState = (usernames, initVal) => {
        return usernames.reduce((obj, key) => (obj[key]=initVal, obj), {});
    }

    #updateFlow = (data, user, state, callback) => {
        console.log(user, " updateFlow ", state);
        this.currData[user] = data;
        this.state[user] = state;
        callback(user);
    }

    initMultiAuth = () => {
        this.usernames.forEach((user) => this.#startAuth(user));
    }

    #startAuth = (user) => {
        console.log(user, "startAuth");
        this.#client.jsonApiCall('POST', '/auth/v2/preauth', {username : user}, (data) => {this.#updateFlow(data, user, 'sendPush', this.#sendPush)});
    }

    #sendPush = (user) => {
        const devices = this.currData[user].response?.devices?.[0]

        console.log(user, "sendPush");

        if (!devices?.capabilities){
            this.#procResult(user);
            return;
        }

        if (devices.capabilities.indexOf('push') !== -1 && this.currData[user]?.stat === 'OK'){
            this.#client.jsonApiCall('POST', '/auth/v2/auth', {username: user, factor: 'auto', device: 'auto', type : 'Remote security challenge', pushinfo: 'from=Demo%20Challenge&domain=test.com&reason=approval%20for%20action'}, (data) => {this.#updateFlow(data, user, 'awaitPush', this.#procResult)});
    }
}

    #procResult = (user) => {
        if (this.currData[user]?.response?.result === 'allow' && this.state[user] === 'awaitPush') {
            this.emit('Approval', user);
        } else {
            this.emit('Denial', user);
        }
    }


}


const startApp = async () => {

    // Express
    const app = express();

    // Express middleware - request parsers / session / static files / templates
    app.use(express.json());
    app.use(express.urlencoded({extended: false}));
    app.use(session({secret: 'super-secret-phrase', resave: false, saveUninitialized: true}));
    app.use(express.static('public', {index: false}));
    nunjucks.configure(`${__dirname}/views`, { autoescape: true, express: app});

    // Duo Client
    const { ikey, skey, apiHost, redirectUrl } = config;
    const client = new duo_api.Client(ikey, skey, apiHost);


    app.get('/', async (req,res) => {
        res.render('index.html', {message: ''});
        return;
    });

    app.get('/multi', async(req, res) => {
        res.render('indexMulti.html', {message: ''});
    });

    app.post('/', async (req, res) => {
        const {username} = req.body;


        if (!username) {
            res.render('index.html', {message: 'Missing username or password'});
        return;
        }

        try {
                
            flow = new AuthFlow(client, username, res);
            flow.startAuth()
        
            } catch (err) {
                console.log(err);
        }
    });

    app.post('/multi', async(req, res) => {
        const {usernames, threshold} = req.body;

        console.log(usernames)


        if (!usernames || !Array.isArray(usernames)) {
            res.render('indexMulti.html', {message: 'Missing username or single user provided.'});
        return;
        }

        if (!threshold || threshold > usernames.length) {
            res.render('indexMulti.html' , {message: 'Threshold missing or greater than number of users.'});
        }

        try {
            flow = new MultiAuthFlow(client, usernames, threshold, res);
            flow.initMultiAuth();
        } catch (err) {
            console.log(err);
        }

    });

    // Start listening
    app.listen(config.port, config.url, (err) => {
        console.log(`App listening on port ${config.port}.`)
        if (err) {
            console.log(err);
            return;
        }
    });
};

startApp().catch((err) => {
    console.error(err);
});
