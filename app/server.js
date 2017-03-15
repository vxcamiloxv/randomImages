/**
 * @fileOverview main server
 * @name server.js
 * @author Camilo Quimbayo <vxcamiloxv@openmailbox.org>
 */
(function () {
    "use strict";

    var q = require("q");
    var path = require("path");
    var http = require("http");
    var boom = require("boom");
    var nunjucks = require("nunjucks");
    var morgan  = require("morgan");
    var bunyan  = require("bunyan");
    var session = require("express-session");
    var bodyParser = require("body-parser");
    var compression = require("compression");
    var express = require("express");
    var config = require("../config");

    function createServer (configData) {
        var deferred = q.defer();
        var app = express();
        var log = bunyan.createLogger({name: "randonImages"});
        var server;


        // Define basics
        var port = process.env.PORT || configData.port;
        var host = configData.host || configData.hostname;
        var address = configData.address || host;
        configData.urlHost = configData.urlHost || address + (port === 443 || port === 80 ? "" : ":" + port);
        process.env.NODE_ENV = configData.enviroment || "development";

        // Create server
        configData.urlHost = "http://" + configData.urlHost;
        log.debug("Run over HTTP Server.");
        server = http.createServer(app);

        // Set render engine
        app.set("view engine", "html");
        nunjucks.configure(path.resolve(__dirname, "./views"), {
            autoescape: true,
            express: app,
            tags: {
                variableStart: "{{=",
                variableEnd: "=}}"
            }
        });

        // Static files
        app.use(express.static(path.resolve(__dirname, "../public"), { maxAge: 86400000 }));

        // Setup session
        var sessionMiddleware = session({
            secret: configData.secret,
            resave: false,
            saveUninitialized: false
            // cookie: { secure: true }
        });

        // Acces log
        app.use(morgan("combined", {
            skip: function (req, res) { return res.statusCode < 400 }
        }));

        // Body parse
        app.use(bodyParser.urlencoded({extended: true}));
        app.use(bodyParser.json());

        // Some middlewares
        app.use(sessionMiddleware);
        if (configData.compression) {
            app.use(compression());
        }

        // App locals
        app.locals.site = {
            siteName: "RandomImage"
        };
        app.locals.version = "0.1.0";

        // Default data
        app.use(function (req, res, next) {
            // Locals by request
            res.locals.page = {url: req.originalUrl};

            next();
        });

        // Set config
        app.config = configData;

        // Listen server
        server.listen(port, function () {
            // Set instance
            app.address = this.address();
            app.address.port = port;
            app.address.host = host;

            // load all routes
            app.get("/", function (req, res) {
                res.render("index");
            });
            app.get("/admin", function (req, res) {
                res.render("admin");
            });
            // Error Handler
            app.use(error404);

            log.debug("Finished setting up server");
            log.info("Listening on %s for host %s", app.address.port, app.address.host);

            deferred.resolve({app: app});
        });
        /**
         * @private
         */

        function error404 (req, res, next) {
            var err = boom.notFound().output.payload;
            var msg = err.message || err.error;
            // Server error and redirect
            res.status(err.statusCode);
            res.render("error", {
                page: {
                    title: msg
                }, error: {
                    status: err.statusCode,
                    message: msg,
                    stack: configData.enviroment == "development" ? err.stack || msg : msg
                }});
        }

        // Events
        process.on("uncaughtException", function (err) {
            log = log || console;
            log.error(err);
        });
        process.on("exit", function (code) {
            log = log || console;
            log.debug("About to exit process " + process.pid + " with code: " + code);
        });

        // Promise
        return deferred.promise;
    }

    createServer(config);

})();
