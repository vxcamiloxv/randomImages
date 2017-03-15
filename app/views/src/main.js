/**
 * @fileOverview main app
 * @name main.js
 * @author Camilo Quimbayo <vxcamiloxv@openmailbox.org>
 */
(() => {
    "use strict";

    const Vue = require("vue");
    const q = require("q");
    const is = require("is2");
    const ld = require("lodash");
    const firebase = require("firebase");
    const moment = require("moment");
    const crypto = require("crypto-js");
    const vueResource = require("vue-resource");
    const vueFire = require("vuefire");
    const vueJsonp = require("vue-jsonp");
    const vueLogger = require("vue-logger");
    const config = require("../../../config");

    // Plugins
    Vue.use(vueResource);
    Vue.use(vueFire);
    Vue.use(vueLogger, { prefix: new Date(), dev: true });
    Vue.use(vueJsonp, 5000);

    // Firebase
    firebase.initializeApp(config.firebase);
    var db = firebase.database();
    var userRef = db.ref("users");
    var imageRef = db.ref("images");

    // Instance
    var vue = new Vue({
        el: "#app",
        components: {},

        data: {
            newUser: {
                name: "",
                email: "",
                password: ""
            },
            isAuthorized: false,
            user: {},
            admin: {},
            images: [],
            errors: []
        },

        firebase: {
            users: userRef
        },
        mounted () {
            this.validateUser();
            if (!this.asAdmin()) {
                this.getImages();
            }
        },
        computed: {
            validation: function () {
                let rules = {
                    name: !!this.newUser.name.trim(),
                    email: is.email(this.newUser.email)
                };

                if (this.asAdmin()) {
                    rules = {
                        password: !!this.newUser.password.trim(),
                        email: is.email(this.newUser.email)
                    }
                }
                return rules;
            },
            isValid: function () {
                var validation = this.validation
                return Object.keys(validation).every(function (key) {
                    return validation[key]
                })
            }
        },

        filters: {
            moment: function (date, format) {
                return moment(date).format(format || "MMM DD YYYY, h:mm:ss a");
            },
            duration: function (time, format) {
                return moment.utc(time).format(format || "HH:mm:ss");
            }
        },

        methods: {
            validateUser () {
                let user = window.sessionStorage.user ? JSON.parse(window.sessionStorage.user) : {};
                this.user = user;

                if ((user.role === "admin" || this.asAdmin()) &&
                    window.sessionStorage.token && window.sessionStorage.sessionId) {
                    user = crypto.AES.decrypt(window.sessionStorage.sessionId,
                                              window.sessionStorage.token).toString(crypto.enc.Utf8);
                    user = JSON.parse(user);

                    this.getAdmin(user.email, user.password).then((user) => {
                        this.admin = user;
                        this.isAuthorized = true;
                    }, this.logOut);

                } else {
                    this.getUser(this.user.email).then((user) => {
                        if (!user) {
                            this.logOut();
                        } else {
                            this.isAuthorized = true;
                        }
                    }, this.logOut);
                }

            },

            asAdmin () {
                let path = window.location.pathname;
                return path.match(/admin/) ? true : false;
            },

            getAdmin (email, password) {
                let deferred = q.defer();
                this.errors = [];

                firebase.auth().signInWithEmailAndPassword(email, password).then((user) => {
                    user.name = "Admin";
                    user.role = "admin";

                    deferred.resolve(user);
                }, (error) => {
                    this.errors.push(error);
                    this.$log.warn(error.message);
                    deferred.reject(error);
                });

                return deferred.promise;
            },

            getUser (email) {
                let deferred = q.defer();
                let user;

                if (!email) {
                    deferred.reject();
                    return deferred.promise;
                }
                userRef.orderByChild("email").equalTo(email).once("value", (snapshot) => {
                    snapshot.forEach((data) => {
                        user = data.val();
                    });
                    deferred.resolve(user);

                }, (err) => {
                    this.$log.debug(err);
                    deferred.reject(err);
                });
                return deferred.promise;
            },

            signIn () {
                let asAdmin = this.asAdmin();
                let getUser = asAdmin ? this.getAdmin : this.getUser;

                if (!this.isValid) {
                    return;
                }

                getUser(this.newUser.email, this.newUser.password).then((user) => {
                    this.isAuthorized = true;
                    if (!user && !asAdmin) {
                        user = ld.clone(this.newUser);
                        userRef.push(this.newUser);
                    }

                    if (user.getToken && asAdmin) {
                        this.admin = {
                            name: user.name,
                            role: user.role,
                            email: user.email,
                            password: this.newUser.password
                        };
                        user.getToken().then((token) => {
                            window.sessionStorage.token = token;
                            window.sessionStorage.sessionId = crypto.AES.encrypt(
                                JSON.stringify(this.admin), token).toString();
                        });
                    } else {
                        this.user = user;
                        window.sessionStorage.user = JSON.stringify(user);
                    }

                    this.newUser.name = "";
                    this.newUser.email = "";
                    this.newUser.password = "";
                });
            },

            logOut () {
                this.isAuthorized = false;
                if (this.asAdmin()) {
                    firebase.auth().signOut();
                    window.sessionStorage.removeItem("token");
                    window.sessionStorage.removeItem("sessionId");
                    this.admin = {};
                } else {
                    window.sessionStorage.removeItem("user");
                    this.user = {};
                }
            },

            getImages () {
                this.$jsonp("http://api.flickr.com/services/feeds/photos_public.gne", {
                    tagmode: "any",
                    format: "json",
                    callbackQuery: "jsoncallback"
                }).then((data) => {
                    this.images = [];

                    for (let i = 0; i < 2; i++) {
                        let rnd = Math.floor(Math.random() * data.items.length);
                        this.images.push(data.items[rnd].media.m);
                    }
                });

            },

            userImages (email) {
                if (!email) {
                    this.images = [];
                    return;
                }

                this.images = [];
                imageRef.orderByChild("user").equalTo(email).once("value", (snapshot) => {
                    snapshot.forEach((data) => {
                        this.images.push(data.val());
                    });
                }, (err) => {
                    this.$log.debug(err);
                });
            },

            saveImage (image_url) {
                imageRef.push({
                    user: this.user.email,
                    url: image_url
                });
                this.getImages();
            }

        }
    });

    module.exports = vue;


})();
