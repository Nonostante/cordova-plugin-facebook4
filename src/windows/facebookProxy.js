var appId,
    wpId,
    authData,
    authInProgress = false;

require("cordova/confighelper").readConfig(function (config) {
    appId = config.getPreferenceValue("APP_ID");
});

try {
    authData = JSON.parse(localStorage.getItem("_fbca"));
} catch (e) { }

function saveAuthData() {
    localStorage.setItem("_fbca", JSON.stringify(authData));
}

function clearAuthData() {
    localStorage.removeItem("_fbca");
    authData = null;
    accessToken = null;

    //clear cookies
    var filter = new Windows.Web.Http.Filters.HttpBaseProtocolFilter();
    var manager = filter.cookieManager;
    var cookies = manager.getCookies(new Windows.Foundation.Uri(getEndPoint("dialog")));
    for (var a = 0; a < cookies.length; a++) {
        manager.deleteCookie(cookies[a]);
    }
    if (Windows.Foundation.Metadata.ApiInformation.isApiContractPresent("Windows.Foundation.UniversalApiContract", 3, 0)) {
        filter.clearAuthenticationCache();
    }
    filter.close();
}

function setAuthData(data) {
    authData = data;
    saveAuthData();
}

function editAuthData(obj) {
    if (!authData) return;
    for (var key in obj) {
        authData[key] = obj[key];
    }
    saveAuthData();
}

function getAuthStatus() {
    if (authData) {
        return {
            status: "connected",
            authResponse: {
                session_key: true,
                accessToken: authData.accessToken,
                expiresIn: 0 | (authData.expires - Date.now() / 1000),
                userID: authData.userId
            }
        }
    } else {
        return {
            status: "unknown"
        };
    }
}

function getEndPoint(type) {
    switch (type) {
        case "login": return "https://www.facebook.com/dialog/oauth";
        case "dialog": return "https://www.facebook.com/dialog/";
        case "graph": return "https://graph.facebook.com";
    }
}

var authFromProtocol = false;
var authFromProtocolCallback = null;

//log events
Windows.UI.WebUI.WebUIApplication.addEventListener("activated", function (e) {
    if (e.kind === Windows.ApplicationModel.Activation.ActivationKind.protocol && e.uri) {
        if (e.uri.host === "authorize") {
            authFromProtocol = true;

            doLoginSuccessQueryParsing(e.uri.queryParsed, function () {
                authFromProtocol = false;
                if (authFromProtocolCallback) {
                    authFromProtocolCallback(getAuthStatus());
                }
                authFromProtocolCallback = null;
            });
        }
    }

    facebookConnectPlugin.logEvent(null, null, ["fb_mobile_activate_app"]);
});
Windows.UI.WebUI.WebUIApplication.addEventListener("suspended", function () {
    facebookConnectPlugin.logEvent(null, null, ["fb_mobile_deactivate_app"]);
});

var dialogEndUrls = [
    ["https://www.facebook.com/connect/login_success.html", "success"],
    //["https://www.facebook.com/connect/blank.html", "fail"],
    ["https://www.facebook.com/dialog/return/close", "fail"],
    ["https://www.facebook.com/dialog/close", "fail"]
];

function createDialog(params, s, f) {
    //check if previous instance
    var prev = document.getElementById("_fbcd");
    prev && prev.remove();

    var query = "";
    for (var k in params) {
        if (k.toUpperCase() !== "METHOD") {
            query += "&" + k + "=" + encodeURIComponent(params[k]);
        }
    }

    var callbackURL = dialogEndUrls[0][0];
    var destURL = getEndPoint("dialog") + params.method + "?app_id=" + appId +
        "&access_token=" + authData.accessToken +
        "&display=popup" +
        query.toLowerCase() +
        "&redirect_uri=" + encodeURIComponent(callbackURL);
    var iframe = document.createElement("x-ms-webview");
    iframe.style.cssText = "width:100%;max-width:560px;height:100%;";
    iframe.navigate(getEndPoint("dialog") + params.method + "?app_id=" + appId +
        "&access_token=" + authData.accessToken +
        "&display=popup" +
        query.toLowerCase() +
        "&redirect_uri=" + encodeURIComponent(callbackURL)
    );

    var container = document.createElement("div");
    container.id = "_fbcd";
    container.style.cssText = "position:absolute;z-index:9999;right:0;bottom:0;top:0;left:0;text-align:center;";
    container.appendChild(iframe);

    var btnClose = document.createElement("button");
    btnClose.textContent = "CLOSE";
    btnClose.addEventListener("click", function () {
        closeDialog(null, { error: "cancelled" });
    });
    btnClose.style.cssText = "padding:4px 12px;position:absolute;left:50%;top:6px;transform:translateX(-50%);";
    container.appendChild(btnClose);

    document.body.appendChild(container);
    iframe.focus();

    var listener = iframe.addEventListener("MSWebViewFrameNavigationCompleted", function (ev) {
        var uri = iframe.src;
        for (var a = 0; a < dialogEndUrls.length; a++) {
            if (uri.startsWith(dialogEndUrls[a][0])) {
                if (dialogEndUrls[a][1] === "success") {
                    //get data
                    var parsed = new Windows.Foundation.Uri(uri);
                    var query = parsed.queryParsed;
                    var obj = {};
                    for (var a = 0; a < query.length; a++) {
                        var pair = query.getAt(a);
                        if (pair.name.indexOf("[") < 0) {
                            obj[pair.name] = pair.value;
                        } else { //array
                            var m = pair.name.match("(.+)\\[(.+)\\]")
                            if (!obj[m[1]]) {
                                obj[m[1]] = [];
                            }
                            obj[m[1]][m[2]] = pair.value;
                        }
                    }
                    closeDialog(obj);
                } else {
                    closeDialog(null, { error: "cancelled" });
                }
                return;
            }
        }
    });

    function closeDialog(data, err) {
        iframe.removeEventListener(listener);
        iframe.remove();
        container.remove();
        document.body.focus();
        if (err) {
            f && f(err);
        } else {
            s && s(data);
        }
    }
}

function refreshPermission(s, f) {
    facebookConnectPlugin.graphApi(
        function (data) {
            setAuthData({ permissions: data.data });
            s && s(data.data);
        },
        f,
        ["/me/permissions"]);
}

var authReAskPermission = false;

function supportFacebookConnect(cb) {
    if (!wpId || wpId.trim() === "") {
        cb(false);
        return;
    }
    Windows.System.Launcher.queryUriSupportAsync(new Windows.Foundation.Uri("fbconnect://authorize", 0), 0).then(
        function (result) {
            cb(result === Windows.System.LaunchQuerySupportStatus.available);
        },
        cb);
}

function loginViaProtocol(permissions, s, f) {
    var sid = wpId.split("-").join("");
    var facebookURL = "fbconnect://authorize?" +
        "client_id=" + appId +
        "&scope=" + permissions.join(",") +
        "&redirect_uri=" + encodeURIComponent("msft-" + sid + ":") + "//authorize";

    if (authReAskPermission) {
        authReAskPermission = false;
        facebookURL += "&auth_type=rerequest";
    }

    authFromProtocolCallback = s;

    Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri(facebookURL)).then(null, f);
}

function loginViaWebAuth(permissions, s, f) {
    var ns = Windows.Security.Authentication.Web;
    var callbackURL = ns.WebAuthenticationBroker.getCurrentApplicationCallbackUri().displayUri;
    var facebookURL = getEndPoint("login") +
        "?client_id=" + appId +
        "&redirect_uri=" + encodeURIComponent(callbackURL) +
        "&scope=" + permissions.join(",") +
        "&display=popup" +
        "&response_type=token";

    if (authReAskPermission) {
        authReAskPermission = false;
        facebookURL += "&auth_type=rerequest";
    }

    var startURI = new Windows.Foundation.Uri(facebookURL);

    authInProgress = true;
    ns.WebAuthenticationBroker.authenticateAsync(ns.WebAuthenticationOptions.none, startURI).done(
        function (result) {
            authInProgress = false;
            switch (result.responseStatus) {
                case ns.WebAuthenticationStatus.success:
                    var fragment = result.responseData.substring(result.responseData.indexOf("#") + 1),
                        query = Windows.Foundation.WwwFormUrlDecoder(fragment);

                    doLoginSuccessQueryParsing(query, s, f);

                    break;
                case ns.WebAuthenticationStatus.errorHttp:
                    f && f("HttpError");
                    break;
                case ns.WebAuthenticationStatus.userCancel:
                    f && f("UserCancel");
                    break;
            }
        },
        function (err) {
            authInProgress = false;
            f && f(err);
        });
}

function doLoginSuccessQueryParsing(query, s, f) {
    try {
        accessToken = query.getFirstValueByName("access_token");
    } catch (e) {
        f && f("UserCancel");
        return;
    }

    setAuthData({
        accessToken: accessToken,
        expires: 0 | (Date.now() / 1000 + parseInt(query.getFirstValueByName("expires_in") || "0")),
        userId: null
    });

    //get the userId
    facebookConnectPlugin.graphApi(
        function (data) {
            editAuthData({ userId: data.id, permissions: data.permissions.data });
            s && s(getAuthStatus());
        },
        function () {
            s && s(getAuthStatus());
        },
        ["/me?fields=id,permissions"]
    );
}

var facebookConnectPlugin = {
    login: function (s, f, permissions) {
        if (authFromProtocol) {
            authFromProtocolCallback = s;
            return;
        }

        if (authInProgress) {
            f && f("Auth_Pending");
            return;
        }
        if (!permissions || !Array.isArray(permissions)) {
            f && f("Permission must be a string array");
            return;
        }

        //check if already logged
        if (authData && authData.expires && (Date.now() / 1000 < authData.expires)) {
            //check permissions
            facebookConnectPlugin.checkHasCorrectPermissions(
                function () {
                    s && s(getAuthStatus());
                },
                function (err) {
                    authInProgress = false;
                    if (err && err.error === "notGranted") {
                        authReAskPermission = true;
                        facebookConnectPlugin.login(s, f, permissions);
                    } else {
                        clearAuthData();
                        facebookConnectPlugin.login(s, f, permissions);
                    }
                },
                permissions
            )
            return;
        }

        supportFacebookConnect(function (r) {
            if (r === true) {
                loginViaProtocol(permissions, s, f);
            } else {
                loginViaWebAuth(permissions, s, f);
            }
        });
    },

    logout: function (s, f) {
        clearAuthData();
        s && s();
    },

    getAccessToken: function (s, f) {
        authData ? (s && s(authData.accessToken)) : (f && f("NO_TOKEN"));
    },

    getLoginStatus: function (s, f) {
        s && s(getAuthStatus());
    },

    graphApi: function (s, f, args) { //graphPath, method?, body?, permissions?
        var graphPath = args[0],
            method = (typeof args[1] === "string" ? args[1] : "get").toUpperCase(),
            body = typeof args[2] === "object" ? args[2] : null;

        if (!graphPath || graphPath[0] !== "/") {
            f && f("Graph path must begin with '/'");
            return;
        }
        if (method === "POST" && !body) {
            f && f("Body is required when method is post");
            return;
        }
        if (!authData) {
            f && f("NOT_LOGGED_IN")
            return;
        }

        if (graphPath.indexOf("?") > 0) {
            graphPath += "&"
        } else {
            graphPath += "?"
        }

        graphPath = getEndPoint("graph") + graphPath +
            "access_token=" + authData.accessToken;

        var ns = Windows.Web.Http;

        var request = new ns.HttpRequestMessage(
            new ns.HttpMethod(method),
            new Windows.Foundation.Uri(graphPath));

        request.content = new ns.HttpStringContent(JSON.stringify(body));

        var http = new ns.HttpClient();
        http.sendRequestAsync(request).then(
            function (response) {
                response.content.readAsStringAsync().then(
                    function (data) {
                        if (response.isSuccessStatusCode) {
                            s && s(JSON.parse(data));
                        } else {
                            try {
                                data = JSON.parse(data);
                            } catch (e) { }
                            f && f({
                                error: data,
                                httpStatus: response.statusCode
                            });
                        }
                    }, f);
            }, f);
    },

    showDialog: function (s, f, args) { //options
        if (!args || typeof args[0] !== "object" || !args[0].method) {
            f && f("Option method field required");
            return;
        }

        createDialog(args[0], s, f);
    },

    checkHasCorrectPermissions: function (s, f, args) {
        var permissions = args && args[0];
        if (!permissions) {
            f && f("NO_PERMISSION_SPECIFIED");
            return;
        }

        if (!Array.isArray(permissions)) {
            permissions = [permissions];
        }

        refreshPermission(function (data) {
            for (var a = 0; a < permissions.length; a++) {
                var toCheck = permissions[a].toLowerCase();
                var perm = null;
                for (var b = 0; b < data.length; a++) {
                    if (data[b].permission === toCheck) {
                        perm = data[b];
                        break;
                    }
                }

                if (!perm || perm.status !== "granted") {
                    f && f({
                        error: "notGranted",
                        permissions: data
                    });
                    return;
                }
            }

            s && s();
        }, f);
    },

    logEvent: function (s, f, args) { //eventName, params, valueToSum
        var eventName = args[0],
            params = args[1],
            value = parseFloat(args[2] || "0");

        if (!eventName) {
            f && f("EventName is required");
            return;
        }

        var adId = Windows.System.UserProfile.AdvertisingManager.advertisingId;

        var body;
        //standard event and shortcut
        if (eventName.toUpperCase() === "MOBILE_APP_INSTALL" || eventName.toUpperCase() === "INSTALL") {
            body = {
                event: "MOBILE_APP_INSTALL",
                advertiser_id: adId,
                advertiser_tracking_enabled: !!adId
            };
        } else {
            //custom events
            var customEvent = {
                _eventName: eventName,
                _valueToSum: value,
                _logTime: Date.now() / 1000
            };
            if (params) {
                for (var key in params) {
                    customEvent[key] = params[key];
                }
            }
            body = {
                event: "CUSTOM_APP_EVENTS",
                advertiser_id: adId,
                advertiser_tracking_enabled: !!adId,
                custom_events: [
                    customEvent
                ]
            };
        }

        facebookConnectPlugin.graphApi(s, f, [
            "/" + appId + "/activities",
            "post",
            body
        ]);
    },

    logPurchase: function (s, f, args) { //value, currency
        var value = args[0],
            currency = args[1];
        return facebookConnectPlugin.logEvent(s, f, [
            "fb_mobile_purchase",
            { fb_currency: currency },
            value
        ]);
    },

    activateApp: function (s, f) {
        return facebookConnectPlugin.logEvent(s, f, ["fb_mobile_activate_app"]);
    },

    appInvite: function (s, f) {
        f && f("NOT_SUPPORTED");
    },

    getDeferredApplink: function (s, f) {
        f && f("NOT_SUPPORTED");
    }
};

cordova.commandProxy.add("FacebookConnectPlugin", facebookConnectPlugin);
