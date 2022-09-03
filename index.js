const express = require("express");
const session = require("express-session");
const nunjucks = require('nunjucks')
const config = require('./config');
const duo_api = require('@duosecurity/duo_api');

class AuthFlow {
    constructor(client, username, res){
        this.username = username;
        this.res = res;
        this.currData = null;
        this.state = 'preAuth';
        this.client = client;
    }

    updateFlow = (data, state, callback) => {
        this.currData = data;
        this.state = state;
        callback();
    }

    startAuth = () => {
        this.client.jsonApiCall('POST', '/auth/v2/preauth', {username : this.username}, (data) => {this.updateFlow(data, 'sendPush', this.sendPush)});
    }

    sendPush = () => {
        const devices = this.currData.response?.devices[0]

        if (devices.capabilities.indexOf('push') !== -1 && this.currData?.stat === 'OK'){
            this.client.jsonApiCall('POST', '/auth/v2/auth', {username: this.username, factor: 'auto', device: 'auto'}, (data) => {this.updateFlow(data, 'awaitPush', this.procResult)});
    }
}

    procResult = () => {
        if (this.currData?.response?.result === 'allow' && this.state === 'awaitPush') {
            this.res.render('success.html', {message: 'Challenge Approved'});
        } else {
            this.res.render('success.html', {message: 'Challenge Denied'});
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

    app.post('/', async (req, res) => {
        const {username,password} = req.body;

        if (!username || !password) {
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
