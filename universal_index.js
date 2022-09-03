const { Client } = require("@duosecurity/duo_api");


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
    const { clientId, clientSecret, apiHost, redirectUrl } = config;    
    const duoClient = new Client(clientId, clientSecret, apiHost, redirectUrl)

    app.post('/', async (req, res) => {
        const {username, password} = req.body;

        if (!username || !password) {
            res.render('index.html', {message: 'Missing username or password'});
        return;
        }

        try {
            await duoClient.healthCheck();

            const state = duoClient.generateState();
            req.session.duo = {state, username};
            const url = duoClient.createAuthUrl(username, state);

            res.redirect(302, url);
        } catch (err) {
            console.error(err);
            res.render('index.html', {message: err.message});
        }

        app.get('/redirect', async (req, res) => {
            const {query, session} = req;
            const {duo_code, state} = query;

            if (!duo_code || typeof duo_code !== 'string') {
                res.render('index.html', {message: `Missing 'duo_code' query parameter`});
                return;
            }

            if (!state || typeof state !== 'string') {
                res.render('index.html', {message:`Missing 'state' query parameter`});
            }

            const savedState = session.duo?.state;
            const savedUsername = session.duo?.username;

            req.session.destroy();

            if (
                !savedState ||
                typeof savedState !== 'string' ||
                !savedUsername ||
                typeof savedUsername !== 'string'
             ) {
                res.render('index.html', {message: 'Missing user session information'});
             }

             if (state !== savedState) {
                res.render('index.html', {message: 'Duo state does not match saved data'});
             }


             try {
                const decodedToken = await duoClient.exchangeAuthorizationCodeFor2FAResult(
                    duo_code,
                    savedUsername
                ).then(console.log(decodedToken));
                
                if (decodedToken.auth_result?.result === 'allow') {
                    console.log(JSON.stringify(decodedToken, null, '\t'))
                    res.render('success.html', {message: 'Challenge Approved'});
                } else {
                    throw('Auth result not "allow"');
                }
                
             } catch (err) {
                console.error(err);

                res.render('index.html', {message: 'Error decoding Duo result. Confirm device clock is correct'}); 
             }
        });
    });

// Start listening
app.listen(config.port, config.url, (err) => {
        if (err) {
            console.log(err);
            return;
        }
    });
};

startApp().catch((err) => {
    console.error(err);
});
