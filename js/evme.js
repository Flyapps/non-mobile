// main evme module
(function(scope, moduleName) {
  // make sure we have the navigator.evme object
  // to avoid re-testing throughout the app
  if (!(moduleName in navigator)) {
    navigator[moduleName] = {};
  }

  function Evme() {
    // get currently executed script base path
    var elLastScript = document.querySelectorAll('script');
    elLastScript = elLastScript[elLastScript.length - 1].src;
    this.MODULES_BASE_PATH = elLastScript.substring(0, elLastScript.lastIndexOf('/') + 1);
  }

  Evme.prototype = {
    // where all the modules will be loaded from
    MODULES_BASE_PATH: '/',

    env: 'prod',

    // modules configurations
    Modules: {
      // a simple image rotator which you can swipe through
      Rotator: {
        "version": 1
      },
      // a slideshow combining two rotators- main image and thumbnails strip
      Slideshow: {
        "dependencies": ['Rotator'],
        "version": 1
      },
      // a loading indicator (spinner)
      Loader: {
        "singleton": true,
        "version": 1
      },
      L10N: {
        "objectName": 'l10n',
        "singleton": true,
        "version": 1
      },
      Location: {
        "singleton": true,
        "version": 1
      }
    },

    // events that are being triggered
    EVENTS: {
      READY: 'ready'
    },

    // this will hold all the query string params
    params: {},

    // params to always add, even as empty values- to not get undefineds
    defaultParams: ['do_query', 'do_experience'],

    // main initialization method- all apps should call this first!
    init: function evme_init(options, onReady) {
      !options && (options = {});

      var url = window.location.host;
      if (/(loc\.|10\.0\.0\.)/.test(url)) {
        this.env = 'loc';
      } else if (/(stg\.)/.test(url)) {
        this.env = 'stg';
      }

      // in case the developer just passes a single param as a callback
      if (options instanceof Function) {
        onReady = options;
      }

      var modulesConfig = options.modules || {};

      // extends the console object, add a nicer more controlled one
      this.extendConsole();
      // add classes to the body element according to environment
      this.setBodyClasses();
      // load all the modules
      this.loadModules(modulesConfig, onReady);
      // parse the query string and fill our .params map
      this.refreshQueryStringParams();
      // parse the page's HTML for any special tags or attributes
      this.parseHTML();
      // initialize navigation module- for paging animation and history management
      this.nav.init(modulesConfig.nav);
      // initialize analytics module- reporting with Google Analytics
      this.analytics.init(modulesConfig.analytics);

      this.eventicide(this.nav);

      // actually enable the analytics object
      // without this GA won't load, and nothing will get reported
      // here so we can decide to enable it for just a percentage of the users
      this.analytics.enable();

      // listen to postMessage
      window.addEventListener('message', this.onMessage);

      evme.utils.trigger(moduleName, this.EVENTS.READY, {
        'post': true
      });
    },

    onMessage: function evme_onMessage(message) {
      if (!message) {
        return;
      }

      if (!/\.flyapps\.me/g.test(message.origin)) {
        evme.warn('evme', 'Message from unknown origin!');
        return;
      }

      try {
        message = JSON.parse(message.data);
      } catch(ex) {
        evme.warn('evme', 'Message not JSON: ' + message);
      }

      var moduleName = message.module || '',
          module = moduleName? evme[moduleName] || evme : evme,
          method = message.method;

      if (method && module && module.on && module.on[method]) {
        module.on[method](message);
      } else {
        evme.warn('evme', 'Sending unsupported method: ' + JSON.stringify(message));
      }
    },

    // load all the modules the developer requested
    loadModules: function evme_loadModules(modules, callback) {
        modules = this._normalizeModulesList(modules);

        var numModulesToLoad = Object.keys(modules).length;

        // first let's load all the modules that the user requested, including their dependencies
        // if there are no modules at all we just call the onModuleLoaded which will fire the callback
        if (numModulesToLoad > 0) {
          for (var module in modules) {
            this.loadModule(module, modules[module], onModuleLoaded);
          }
        } else {
          onModuleLoaded();
        }

        // count each loaded module, until we laoded all of them- fire the onReady callback
        function onModuleLoaded() {
          if (--numModulesToLoad <= 0) {
            callback && window.setTimeout(callback, 0);
          }
        }
    },

    // if the developer passed an array of modules (instead of an object)
    // it means there are no options for the modules, so we convert them to a normalized object
    _normalizeModulesList: function evme_normalizeModulesList(modules) {
      !modules && (modules = []);

      if (Array.isArray(modules)) {
        var moduleNames = modules;
        modules = {};
        for (var i=0,moduleName; moduleName = moduleNames[i++];) {
          modules[moduleName] = {};
        }
      }

      return modules;
    },

    // load a single module
    // this method knows to handle dependencies, and will only call the onLoad
    // once ALL the dependencies have been loaded
    // IT'S RECURSIVE!!1
    loadModule: function evme_loadModule(moduleName, moduleOptions, onLoad) {
      var self = this,
          moduleConfig = this.Modules[moduleName],
          moduleObjectName = moduleConfig && moduleConfig.objectName || moduleName,
          moduleDependencies = moduleConfig && moduleConfig.dependencies || [];

      // if the module exists, we send true
      if (evme[moduleObjectName]) {
        onLoad();
        return true;
      }

      // to load a module it MUST appear on the above modules config
      if (!moduleConfig || !moduleObjectName) {
        throw 'Invalid module: ' + moduleName;
      }

      // iterate over all the dependency modules and load them
      for (var i=0,depModuleName; depModuleName=moduleDependencies[i++];) {
        this.loadModule(depModuleName);
      }

      // if the code reached here it means all the dependency modules were loaded!
      // now to load the main module
      var elParent = document.querySelector('head'),
          elScript = document.createElement('script');
      elScript.type = 'text/javascript';
      elScript.src = this.MODULES_BASE_PATH + 'modules/' + moduleName + '.js';
      elParent.appendChild(elScript);

      checkScriptLoaded();

      // false means the module isn't loaded
      return false;

      // since not all browsers support the "onload" event for the SCRIPT tag
      // we employ a simple interval method of checking if the module was loaded
      function checkScriptLoaded() {
        if (evme[moduleObjectName]) {
          // if the module is defined as a singleton, we init it with the developer-passed options
          if (moduleConfig.singleton) {
            evme[moduleObjectName] = new evme[moduleObjectName](moduleOptions);
          }

          evme.eventicide(evme[moduleObjectName]);

          onLoad && onLoad(moduleName);
        } else {
          window.setTimeout(checkScriptLoaded, 100);
        }
      }
    },

    // add the query string params to the object's .params property
    refreshQueryStringParams: function evme_refreshQueryStringParams() {
      var params = this.utils.parseQueryString();

      // add default params to avoid undefineds
      for (var i=0, param, defaultParams=this.defaultParams; param=defaultParams[i++];) {
        !params[param] && (params[param] = '');
      }

      this.params = params;
    },

    // parse and process special HTML tags and/or attributes
    parseHTML: function evme_parseHTML() {
      this.htmlParser && this.htmlParser.parse();
    },

    // add body classes according to the user agent
    setBodyClasses: function evme_setBodyClasses() {
      var ua = navigator.userAgent,
          device = /Android/i.test(ua)? 'android' :
                   /iPhone/i.test(ua)? 'iphone' :
                   'unknown',
          browser = /Chrome\//i.test(ua)? 'chrome' :
                    /Firefox\//i.test(ua)? 'firefox' :
                    'unknown';

      // since fxos doesn't send any special UA identifier,
      // we use some tricks to detect it
      if (device === 'unknown' && browser === 'firefox' &&
          /Mobile;/g.test(ua) && /Mozilla/g.test(ua)) {
        device = 'fxos';
      }

      // expose the Device and Browser
      this.browser = browser;
      this.device = device;

      document.body.classList.add('evme-env-' + device);
      document.body.classList.add('evme-browser-' + browser);

      if (!('ontouchstart' in window)) {
        document.body.classList.add('evme-non-touch');
      }
    },

    getBuildNum: function evme_getBuildNum() {
      return (navigator.evme || {}).buildNum || '';
    },

    // add common console methods to our evme object
    // this allows both enabling/disabling of console according to environment
    // and adding prefixes and normalizing all logs
    extendConsole: function evme_extendConsole() {
      var methods = ['log', 'info', 'warn', 'error'],
          href = window.location.href,
          SHOW_LOGS = (this.env !== 'prod' || /debug=1/.test(window.location.search)),
          self = this;

      for (var i=0,method; method=methods[i++];) {
        this[method] = (function(method) {
          return function() {
            if (SHOW_LOGS) {
              var args = Array.prototype.slice.call(arguments, 0),
                  moduleName = args[0];

              args[0] = '[' + evme.utils.formatDate('h:i:s:ms') + ' evme.' + moduleName + ']';

              console[method].call(console, args.join(' '));
            }
          }
        }(method));
      }
    },

    // add the bind, unbind, and trigger methods to the module
    eventicide: function evme_eventicide(module) {
      if (!module.NAME) {
        return false;
      }

      module.bind  = function module_bind(eventName, callback, listenToPast) {
        return evme.utils.bind(module.NAME, eventName, callback, listenToPast);
      };
      module.unbind  = function module_bind(eventName, callback) {
        return evme.utils.unbind(module.NAME, eventName, callback);
      };
      module.trigger  = function module_bind(eventName, data) {
        return evme.utils.trigger(module.NAME, eventName, data);
      };

      return true;
    }
  };

  window[moduleName] = new Evme();
}(window, 'evme'));

// evme.htmlParser
(function(scope, moduleName) {
  !scope && (scope = window);

  scope[moduleName] = {
    // go over all the defined parsers (below this method)
    // and apply them to all the elements i nthe scope that match their selectors
    parse: function evme_htmlParser_parse(scope) {
      var scope = scope || document,
          parsers = this._parsers,
          parseMethod,
          matchedElements,
          // loops vars, defined outside for performance
          selector, i, el;

      for (selector in parsers) {
        parseMethod = parsers[selector];
        matchedElements = Array.prototype.slice.call(scope.querySelectorAll(selector) || [], 0);

        for (i=0; el=matchedElements[i++];) {
          parseMethod(el, i-1);
        }
      }
    },

    // this object will hold a map of SELECTOR: PARSE_METHOD
    _parsers: {
      // for inputs containing the "data-evme-submit" attribute
      // we wrap it with a form and give it some default behavior
      "input[data-evme-submit]": function evme_parseSearchbar(elSearchbar, index) {
        var elParent = elSearchbar.parentNode,
            functionSubmitName = elSearchbar.getAttribute('data-evme-submit') || '',
            elForm = document.createElement('form');

        elForm.id = 'evme-searchbar-form';

        elSearchbar.value = scope && scope.params && scope.params.do_query || '';
        elSearchbar.name = 'searchfield';

        // attach all searchbar events (defined at the bottom)
        for (var eventName in SearchbarEvents) {
          elSearchbar.addEventListener(eventName, SearchbarEvents[eventName]);
        }

        // not part of the above events list cause we don't always need it
        // this makes a part of the searchbar act as a "clear" button
        // the logic is that if the user touch event is in the right area of the input
        // we will clear the value. the reason for this code (instead of just using an element)
        // is that the whole event chain (on element on input) doesn't work well in all devices
        if (elSearchbar.getAttribute('data-evme-clear-area')) {
          elSearchbar.addEventListener('touchstart', function onTouchStart(e) {
            var touch = (e.touches || [e])[0],
                x = touch.pageX,
                elBounds = this.getBoundingClientRect(),
                clearButtonArea = elSearchbar.getAttribute('data-evme-clear-area')*1;

            if (x + clearButtonArea >= elBounds.right) {
              this.value = '';
            }
          });
        }

        // this onTempSubmit listener will parse the function name from the attribute
        // and attach a new event listener with the function itself
        // it will only run ONCE, then it will be removed and replaced by the real onSubmit
        elForm.addEventListener('submit', function onTempSubmit(e) {
          var func = scope && scope.utils && scope.utils.getFunctionByName &&
                      scope.utils.getFunctionByName(functionSubmitName) || eval(functionSubmitName);

          // this is the listener that will remain on the element,
          // after the function name as been parsed from the attribute
          this.removeEventListener('submit', onTempSubmit);
          this.addEventListener('submit', onSubmit);
          onSubmit(e);

          function onSubmit(e) {
            e.preventDefault();
            func(elSearchbar.value);
          }
        });

        var elInputSibling = elSearchbar.nextSibling;

        // move the input inside the new form
        elForm.appendChild(elParent.removeChild(elSearchbar));

        // add the form instead of the input
        if (elInputSibling) {
          elParent.insertBefore(elForm, elInputSibling);
        } else {
          elParent.appendChild(elForm);
        }
      }
    }
  };

  var SearchbarEvents = {
    focus: function focus(e) {
      document.body.classList.add('evme-searchbar-focused');
      this.classList.add('focused');
      this.timeoutCheckValue = window.setInterval(SearchbarEvents.keyup.bind(this), 50);
    },
    blur: function blur(e) {
      document.body.classList.remove('evme-searchbar-focused');
      this.classList.remove('focused');
      window.clearInterval(this.timeoutCheckValue);
    },
    keyup: function keyup(e) {
      if (this.value) {
        document.body.classList.remove('evme-searchbar-empty');
        this.classList.remove('empty');
      } else {
        document.body.classList.add('evme-searchbar-empty');
        this.classList.add('empty');
      }

      // blur on Search
      if (e && e.keyCode === 13) {
        this.blur();
      }
    }
  };
}(window.evme, 'htmlParser'));

// evme.utils
(function(scope, moduleName) {
  // use this to determine if the passed selector is a single ID (#elemid)
  // if so- use the getElementById method which is faster, otherwise use querySelector
  var isSelectorIdRegex = /^#[^\s]*$/;

  // "doat resizer" gets a quality param (JPEG compression)
  // this is the default value if the method didn't get it
  var RESIZER_DEFAULT_QUALITY = 80;

  // usually "scope" will be "window.evme", but we test this in case there was a problem with evme
  // and the object isn't available- so we'll add this to the window itself
  !scope && (scope = window);

  // add the $ method (selector helper) to the scope ITSELF
  // and not to the moduleName property
  scope.$ = function querySelector(selector, scope) {
    if (isSelectorIdRegex.test(selector)) {
      return document.getElementById(selector.replace('#', ''));
    } else {
      return (scope || document).querySelectorAll(selector);
    }
  };

  scope[moduleName] = {
    // convert units according to location
    // for example, km to miles for the US
    convertUnits: function convertUnits(options) {
      !options && (options = {});

      // defined all of these INSIDE the function, since this function will
      // not be called often. so no need to save this in memory forever
      var DEFAULT_LOCATION = 'United States',
          CONVERSION_UNITS_PER_LOCATION = {
            'US': {
              'km': 'miles'
            }
          },
          CONVERSION_METHODS = {
            'km': {
              'miles': 0.621372737
            },
            'miles': {
              'km': 1.60934
            }
          },
          DEFAULT_CONVERSIONS = {
            'miles': 'km'
          },
          UNIT_ANNOTATION = {
            'miles': [' mile', ' miles'],
            'km': 'km'
          };

      var units = options.units,
          location = options.location || evme.params.country || DEFAULT_LOCATION,
          addUnit = "addUnit" in options ? !!options.addUnit : true,
          round = options.round,
          convertedUnits = {};

      if (!units) {
        return;
      }

      location = this.getCountryCode(location);

      for (var unit in units) {
        var value = units[unit],
            newUnit = (CONVERSION_UNITS_PER_LOCATION[location] || DEFAULT_CONVERSIONS)[unit],
            newUnitConversion;

        if (newUnit) {
          newUnitConversion = (CONVERSION_METHODS[unit] || {})[newUnit];

          if (newUnitConversion) {
            if (typeof newUnitConversion === 'number') {
              convertedUnits[unit] = value * newUnitConversion;
            }
          }
        }

        if (!(unit in convertedUnits)) {
          newUnit = unit;
          convertedUnits[unit] = value;
        }

        if (typeof round === "number") {
          var roundedValue = convertedUnits[unit];
          if (round === 0) {
            roundedValue = Math.round(roundedValue);
          } else {
            round = Math.pow(10, round);
            roundedValue = Math.round(roundedValue*round)/round;
          }
          convertedUnits[unit] = roundedValue;
        }

        if (addUnit) {
          var unitName = UNIT_ANNOTATION[newUnit];
          // unitName should be an array of [singular, plural]
          // if it's the same for both, it can be a string
          if (typeof unitName === 'string') {
            unitName = [unitName, unitName];
          }

          convertedUnits[unit] += unitName[convertedUnits[unit] === 1? 0 : 1];
        } else {
          convertedUnits[unit] = {
            "value": convertedUnits[unit],
            "unit": newUnit
          };
        }
      }

      return convertedUnits;
    },

    getCountryCode: function getCountryCode(country) {
      if (!country) {
        // first try to use the Location module, if available
        if (!country) {
          country = ('Location' in scope) && scope.Location.params.country;
        }
        // then try and get the country param directly from the query
        if (!country) {
          country = scope.params.country;
        }
      }

      // if the country param is already a country code, just return it
      if (!country) {
        return '';
      } else  if (country.length === 2) {
        return country.toUpperCase();
      } else {
        // used for translation from country names to country codes
        // defined here cause it's not needed anywhere else, so saving mem
        var COUNTRY_CODES = {
          "andorra": "AD","united arab emirates": "AE","afghanistan": "AF",
          "antigua and barbuda": "AG","anguilla": "AI","albania": "AL",
          "armenia": "AM","angola": "AO","antarctica": "AQ","argentina": "AR",
          "american samoa": "AS","austria": "AT","australia": "AU",
          "aruba": "AW","aland islands": "AX","azerbaijan": "AZ",
          "bosnia and herzegovina": "BA","barbados": "BB","bangladesh": "BD",
          "belgium": "BE","burkina faso": "BF","bulgaria": "BG","bahrain": "BH",
          "burundi": "BI","benin": "BJ","saint barthélemy": "BL","bermuda": "BM",
          "brunei darussalam": "BN","brunei": "BN","bolivia": "BO",
          "bonaire, saint eustatius and saba": "BQ","brazil": "BR",
          "bahamas": "BS","bhutan": "BT","bouvet island": "BV","botswana": "BW",
          "belarus": "BY","belize": "BZ","canada": "CA",
          "cocos islands": "CC","democratic republic of the congo": "CD","republic of the congo": "CD",
          "central african republic": "CF","congo": "CG","switzerland": "CH",
          "cote d'ivoire": "CI","ivory coast": "CI","cook islands": "CK","chile": "CL",
          "cameroon": "CM","china": "CN","colombia": "CO","costa rica": "CR",
          "cuba": "CU","cape verde": "CV","curaçao": "CW","curacao": "CW","christmas island": "CX",
          "cyprus": "CY","czech republic": "CZ","germany": "DE","djibouti": "DJ",
          "denmark": "DK","dominica": "DM","dominican republic": "DO",
          "algeria": "DZ","ecuador": "EC","estonia": "EE","egypt": "EG",
          "western sahara": "EH","eritrea": "ER","spain": "ES","ethiopia": "ET",
          "finland": "FI","fiji": "FJ","falkland islands (malvinas)": "FK",
          "micronesia": "FM","faroe islands": "FO",
          "france": "FR","gabon": "GA","united kingdom": "GB","grenada": "GD",
          "georgia": "GE","french guiana": "GF","guernsey": "GG","ghana": "GH",
          "gibraltar": "GI","greenland": "GL","gambia": "GM","guinea": "GN",
          "guadeloupe": "GP","equatorial guinea": "GQ","greece": "GR",
          "south georgia and the south sandwich islands": "GS","guatemala": "GT",
          "guam": "GU","guinea-bissau": "GW","guyana": "GY","hong kong": "HK",
          "heard island and mcdonald islands": "HM","honduras": "HN",
          "croatia": "HR","haiti": "HT","hungary": "HU","indonesia": "ID",
          "ireland": "IE","israel": "IL","isle of man": "IM","india": "IN",
          "british indian ocean territory": "IO","iraq": "IQ",
          "iran": "IR","iceland": "IS","italy": "IT",
          "jersey": "JE","jamaica": "JM","jordan": "JO","japan": "JP",
          "kenya": "KE","kyrgyzstan": "KG","cambodia": "KH","kiribati": "KI",
          "comoros": "KM","saint kitts and nevis": "KN",
          "north korea": "KP","south korea": "KR","kuwait": "KW","cayman islands": "KY",
          "kazakhstan": "KZ","lao people's democratic republic": "LA","laos": "LA",
          "lebanon": "LB","saint lucia": "LC","liechtenstein": "LI",
          "sri lanka": "LK","liberia": "LR","lesotho": "LS","lithuania": "LT",
          "luxembourg": "LU","latvia": "LV","libya": "LY","morocco": "MA",
          "monaco": "MC","moldova": "MD","republic of moldova": "MD", "montenegro": "ME",
          "saint martin (french part)": "MF","madagascar": "MG",
          "marshall islands": "MH","macedonia": "MK","mali": "ML",
          "myanmar": "MM","mongolia": "MN","macao": "MO",
          "northern mariana islands": "MP","martinique": "MQ","mauritania": "MR",
          "montserrat": "MS","malta": "MT","mauritius": "MU","maldives": "MV",
          "malawi": "MW","mexico": "MX","malaysia": "MY","mozambique": "MZ",
          "namibia": "NA","new caledonia": "NC","niger": "NE",
          "norfolk island": "NF","nigeria": "NG","nicaragua": "NI",
          "netherlands": "NL","norway": "NO","nepal": "NP","nauru": "NR",
          "niue": "NU","new zealand": "NZ","oman": "OM","panama": "PA",
          "peru": "PE","french polynesia": "PF","papua new guinea": "PG",
          "philippines": "PH","pakistan": "PK","poland": "PL",
          "saint pierre and miquelon": "PM","pitcairn": "PN","puerto rico": "PR",
          "palestine": "PS","palestinian territory": "PS","portugal": "PT","palau": "PW","paraguay": "PY",
          "qatar": "QA","reunion": "RE","romania": "RO","serbia": "RS",
          "russia": "RU","rwanda": "RW","saudi arabia": "SA",
          "solomon islands": "SB","seychelles": "SC","sudan": "SD",
          "sweden": "SE","singapore": "SG",
          "saint helena, ascension and tristan da cunha": "SH","slovenia": "SI",
          "svalbard and jan mayen": "SJ","slovakia": "SK","sierra leone": "SL",
          "san marino": "SM","senegal": "SN","somalia": "SO","suriname": "SR",
          "south sudan": "SS","sao tome and principe": "ST","el salvador": "SV",
          "sint maarten": "SX","syria": "SY","swaziland": "SZ",
          "turks and caicos islands": "TC","chad": "TD",
          "french southern territories": "TF","togo": "TG","thailand": "TH",
          "tajikistan": "TJ","tokelau": "TK","timor-leste": "TL","east timor": "TL",
          "turkmenistan": "TM","tunisia": "TN","tonga": "TO","turkey": "TR",
          "trinidad and tobago": "TT","tuvalu": "TV","taiwan": "TW",
          "tanzania": "TZ","ukraine": "UA","uganda": "UG","united states": "US",
          "uruguay": "UY","uzbekistan": "UZ","vatican city": "VA","vatican": "VA",
          "saint vincent": "VC","venezuela": "VE",
          "virgin islands, british": "VG","virgin islands, u.s.": "VI",
          "vietnam": "VN","vanuatu": "VU","wallis and futuna": "WF","samoa": "WS",
          "yemen": "YE","mayotte": "YT","south africa": "ZA","zambia": "ZM","zimbabwe": "ZW",
        };

        return (COUNTRY_CODES[country.replace(/^\s+|\s+$/g, '').toLowerCase()] || '').toUpperCase();
      }
    },

    formatDate: function evme_formatDate(format, datetime) {
      var d;

      if (datetime === undefined) {
        d = new Date();
      } else if (typeof datetime === 'object') {
        d = datetime;
      } else {
        d = new Date(datetime);
        if (!d) {
          return datetime;
        }
      }

      if (!format) {
        format = 'd/m/y';
      }

      var year  = d.getFullYear(),
          month = d.getMonth() + 1,
          day   = d.getDate(),
          hour  = d.getHours(),
          minute = d.getMinutes(),
          second = d.getSeconds(),
          mili = d.getMilliseconds();

      (month < 10) && (month = '0' + month);
      (day < 10) && (day = '0' + day);
      (hour < 10) && (hour = '0' + hour);
      (minute < 10) && (minute = '0' + minute);
      (second < 10) && (second = '0' + second);
      (mili < 10) && (mili = '00' + mili);
      (mili < 100) && (mili = '0' + mili);

      format = format.replace(/ms/g, mili);
      format = format.replace(/y/g, year);
      format = format.replace(/m/g, month);
      format = format.replace(/d/g, day);
      format = format.replace(/h/g, hour);
      format = format.replace(/i/g, minute);
      format = format.replace(/s/g, second);

      return format;
    },

    formatString: function evme_formatString(string, args, isURL) {
      !args && (args = {});
      !string && (string = '');

      string = string.replace(/\{\{([^\}]+)\}\}/g, function onMatch(m, k) {
        var value = args[k];

        // covert undefined and nulls to empty strings, to not appear in texts
        if (value === undefined || value === null) {
          value = '';
        }

        // third parameter is "isURL" which tells us to encode the params
        if (isURL) {
          value = encodeURIComponent(value);
        }

        return value;
      });

      return string;
    },

    formatNumber: function evme_formatNumber(value) {
      if (value * 1 !== value) {
        return value;
      }

      // TODO: change the delimiter according to the country
      var delimiter = ',';
      return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, delimiter);
    },

    // trigger a custom event - wrapped in our own method because
    // the Android WebView doesn't support CustomEvent properly
    // the event name will be in the format of evme-MODULE-EVENT
    _eventsFired: {},
    trigger: function evme_utils_trigger(moduleName, eventName, data) {
      var eventLoad,
          eventData = {
            detail: data
          },
          realEventName = [
                            'evme',
                            moduleName.toLowerCase(),
                            eventName.toLowerCase()
                          ].join('-');

      !data && (data = {});

      try {
        eventLoad = new (window.CustomEvent || window.Event)(realEventName, eventData);
      } catch(ex) {
        eventLoad = document.createEvent('Event');
        eventLoad.initEvent(realEventName, true, true);
      }

      window.dispatchEvent(eventLoad);

      if (data.post) {
        var message = {
          'module': moduleName,
          'method': eventName,
          'data': data
        };

        // we try and post the message to the parent as well
        window.postMessage(JSON.stringify(message), '*');
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(JSON.stringify(message), '*');
          }
        } catch(ex) {
          evme.error(ex);
        }
      }

      // we save the events fired, so if someone binds to an event
      // AFTER it's been fired, they'd still get a callback
      this._eventsFired[realEventName] = eventData;
    },

    // bind to evme's custom events, just to normalize the event names
    // if listenToPast == true it means that the callback will be triggered
    // EVEN IF the listener was added AFTER the event was fired
    bind: function evme_utils_bind(moduleName, eventName, callback, listenToPast) {
      var realEventName = [
                            'evme',
                            moduleName.toLowerCase(),
                            eventName.toLowerCase()
                          ].join('-');

      window.addEventListener(realEventName, callback);

      if (listenToPast) {
        var firedEventData = this._eventsFired[realEventName];
        if (firedEventData) {
          callback(firedEventData);
        }
      }
    },

    // unbind to evme's custom events, just to normalize the event names
    unbind: function evme_utils_bind(moduleName, eventName, callback) {
      var realEventName = [
                            'evme',
                            moduleName.toLowerCase(),
                            eventName.toLowerCase()
                          ].join('-');

      window.removeEventListener(realEventName, callback);
    },

    // get the running app's name (extracted from the domain)
    getAppName: function evme_getAppName() {
      return window.location.host.split('.')[0];
    },

    // resize an image according to the given width and height, using our own resizer service
    _resizeUrl: 'http://doatresizer.appspot.com/?url={URL}&width={WIDTH}&height={HEIGHT}&quality={QUALITY}',
    resize: function evme_utils_resize(url, width, height, quality) {
      var ratio = window.devicePixelRatio || 1;

      !width && (width = Math.round(window.innerWidth * ratio));
      !height && (height = Math.round(window.innerHeight * ratio));
      !quality && (quality = RESIZER_DEFAULT_QUALITY);

      return this._resizeUrl.replace('{URL}', encodeURIComponent(url)).
                            replace('{WIDTH}', width).
                            replace('{HEIGHT}', height).
                            replace('{QUALITY}', quality);
    },

    // prefix the given CSS property
    cssPrefix: function evme_utils_cssPrefix(name, value) {
      return '; -webkit-' + name + ': ' + value +
             '; -moz-' + name + ': ' + value +
             '; ' + name + ': ' + value;
    },

    // given a string (like App.search), this methods traveses through the object
    // and returns the actual function reference
    getFunctionByName: function evme_utils_getFunctionByName(functionName) {
      var func = window,
          funcNameParts = functionName.split('.');

      for (var i=0,objName; objName=funcNameParts[i++];) {
        func = func[objName];
      }

      return func;
    },

    // parse the given URL or the document's location and extract al the query string params
    // add them to the object's .params property
    parseQueryString: function evme_utils_parseQueryString(url) {
      !url && (url = window.location.search);

      var params = {};

      // parse query string
      url.replace(/([^&\?]*)=([^&]*)/g, function(){
        params[arguments[1]] = decodeURIComponent(arguments[2]);
      });

      return params;
    },

    // a wrapper to the .get method that knows to request cross-domain JSON (JSONP)
    getJSONP: function(options) {
      !options && (options = {});

      var src = options.src || options.url,
          onSuccess = options.success || function() {},

          elScript = document.createElement('script'),
          callbackName = 'evme_callback_' + Date.now() + '_' + Math.round(Math.random() * 10000);

      // register the callback
      window[callbackName] = function evmeJSONPCallback(data) {
        stopJSONP();
        onSuccess(data);
      };

      // since we can't really about a SCRIPT tag, we simply remove the callback method
      // and try and remove the script element itself
      function stopJSONP() {
        delete window[callbackName];
        elScript && elScript.parentNode && elScript.parentNode.removeChild(elScript);
      }

      if (src.indexOf('?') === -1) {
        src += '?';
      }

      // handle the common jsonp callback param names
      src += '&callback=' + encodeURIComponent(callbackName) +
             '&jsonp=' + encodeURIComponent(callbackName) +
             '&cb=' + encodeURIComponent(callbackName);

      // now add the script to the document and let it load
      elScript.src = src;
      elScript.type = 'text/javascript';
      document.body.appendChild(elScript);

      // expose an abort method to allow developers to cancel the request
      return {
        "abort": stopJSONP
      };
    },

    // a wrapper to the .get method that returns a JSON object
    getJSON: function(options) {
      !options && (options = {});

      var src = options.src || options.url,
          data = options.data || null,
          method = options.method || "GET",
          onSuccess = options.success || function() {},
          onError = options.error || onSuccess;

      // if the request is external and is being made to a different domain,
      // call the jsonp helper method
      if (!options.forceJSON && /http(s?):\/\//.test(src) && src.indexOf(window.location.host) === -1) {
        return this.getJSONP.apply(this, arguments);
      }

      return this.get({
        "src": src,
        "data": data,
        "method": method,
        "success": function onRequestSuccess(response) {
          if (response) {
            var json = null;

            try {
              var json = JSON.parse(response);
            } catch (ex) {
              console.warn('[evme.utils] error parsing JSON response: ' + response)
            }

            if (json) {
              onSuccess(json, response);
              return;
            }
          }

          onError(response);
        },
        "error": function onRequestError(response) {
          onError(response);
        }
      });
    },

    // an HTTP request helper
    // @options.src
    // @options.success
    // @options.error
    get: function(options) {
      !options && (options = {});

      var src = options.src || options.url,
          data = options.data || null,
          method = options.method || "GET",
          onSuccess = options.success || function() {},
          onError = options.error || onSuccess,
          request = new XMLHttpRequest();

      request.onreadystatechange = function onReadyStateChange() {
        if (request.readyState === 4) {
          if (request.status === 200) {
            onSuccess(request.responseText);
          } else if (request.status !== 0) {
            onError(request.responseText);
          }
        }
      };
      request.open(method, src, true);
      request.send(data);

      return request;
    }
  };
}(window.evme, 'utils'));

// evme.cookies
(function(scope, moduleName) {
  scope[moduleName] = {
    "get": function get(key) {
      var cookies = document.cookie.split(';'),
          regexTrimStart = /\s+(.*)/g;

      for(var i=0, cookie; cookie=cookies[i++];) {
        cookie = cookie.split('=');
        if (cookie[0].replace(regexTrimStart, '$1') === key) {
          return cookie[1];
        }
      }

      return null;
    },

    "set": function set(key, value, ttl) {
      var expires = '';

      if (ttl) {
        var date = new Date();
        date.setTime(ttl);
        expires = '; expires=' + date.toGMTString();
      }

      document.cookie = key + '=' + (value || '') + expires + '; path=/';
    },

    "remove": function remove(key) {
      this.set(key, '', -1);
    }
  };
}(window.evme, 'cookies'));

// evme.nav
(function(scope, moduleName) {
  var DEFAULT_TIMING = 'oncomplete',
      DEFAULT_DIRECTION = 'in';

  function Module() {
    var NAME = 'nav',
        self = this,

        elPages = null,
        historyEnabled = false,
        callbacks = {};

    this.NAME = NAME;

    this.EVENTS = {
      GOTO: 'goto'
    };

    this.current_href = '';
    this.current_page = '';
    this.firstPageId = null;
    this.hasMultiplePages = false;
    this.FLIP_FOR_RTL = false;

    this.init = function init(options) {
      !options && (options = {});

      self.FLIP_FOR_RTL = !!options.flipForRTL;

      historyEnabled = !!window.history.pushState;
      elPages = Array.prototype.slice.call(evme.$('.evme-pages .page'), 0);
      self.hasMultiplePages = elPages && elPages.length > 1;
      self.firstPageId = elPages && elPages.length && elPages[0].id;

      self.current_href = window.location.search;

      evme.log(NAME, 'init with ' + elPages.length + ' pages');

      if (historyEnabled) {
        window.addEventListener('popstate', onAddressChanged);
      } else {
        window.history.pushState = function pushStateFill() {};
      }

      if (self.hasMultiplePages) {
        addMultiplePagesLogic();
      }

      for (var i = 0, el; el = elPages[i++];) {
        el.dataset.index = elPages.indexOf(el);
      }
    };

    this.getBoundPages = function getBoundPages() {
      return Object.keys(callbacks);
    };

    this.getDefaultPage = function getDefaultPage() {
      return self.firstPageId || self.getBoundPages()[0] || null;
    };

    this.onNavigation = function onNavigation(page, options) {
      var callback = options.callback,
          timing = options.timing || DEFAULT_TIMING,
          direction = options.direction || DEFAULT_DIRECTION,
          call = !!options.call;

      if (!page) {
        throw "Missing param: page";
      }
      if (!callback) {
        throw "Missing param: callback";
      }

      !callbacks[page] && (callbacks[page] = {});
      !callbacks[page][timing] && (callbacks[page][timing] = {});
      !callbacks[page][timing][direction] && (callbacks[page][timing][direction] = []);
      callbacks[page][timing][direction].push(callback);

      var pageFromURL = scope.utils.parseQueryString().page;
      if (call && !(pageFromURL && pageFromURL !== page) ||
          page === pageFromURL) {

        evme.log(NAME, 'calling when binding: ' + page);

        callback(page);

        evme.utils.trigger(NAME, self.EVENTS.GOTO, {
          'page': page
        });
      }
    };

    this.goTo = function goTo(page, options) {
      if (!page) {
        throw "Missing param: page";
      }

      !options && (options = {});

      var urlParams = options.url || {},
          queryString = evme.utils.parseQueryString();

      // only add the page to the querystring if we actually have more than one page
      if (self.hasMultiplePages || self.getBoundPages().length > 1) {
        urlParams.page = page;
      }

      // replace current url params with the new ones
      for (var k in urlParams) {
        queryString[k] = urlParams[k];
      }
      window.history.pushState(options, null, self.convertObjectToUrl(queryString));
      self.navigateTo(page, queryString);
    };

    this.navigateTo = function navigateTo(page, params) {
      self.current_href = window.location.search;
      self.current_page = page;

      var pageCallbacks = callbacks[page] || {},
          elCurrentPage = document.querySelector('.evme-pages > .page.active'),
          elPage = document.querySelector('.evme-pages #' + page),
          data = {
            'urlParams': params
          };

      evme.log(NAME, 'going to: ' + page);

      // trying to navigate to a nonexistent page!
      if (!elPage) {
        evme.warn(NAME, 'Trying to navigate to nonexistent page: ' + page);
      } else {
        if (elCurrentPage && elCurrentPage.id !== elPage.id) {

          // make sure we show/hide the pages to the right side of the screen
          if (elCurrentPage.dataset.index < elPage.dataset.index) {
            elCurrentPage.classList.remove('hide-right');
            elCurrentPage.classList.add('hide-left');
            elPage.classList.remove('hide-left');
            elPage.classList.add('hide-right');
          } else {
            elCurrentPage.classList.remove('hide-left');
            elCurrentPage.classList.add('hide-right');
            elPage.classList.remove('hide-right');
            elPage.classList.add('hide-left');
          }

          window.setTimeout(function(){
            elCurrentPage.classList.add('animate');
            window.setTimeout(function(){
              elCurrentPage.classList.remove('active');
              elCurrentPage.classList.add('hide');
            });
          });
        }

        window.setTimeout(function(){
          if (!elCurrentPage || (elCurrentPage && elCurrentPage.id !== elPage.id)) {
            elPage.classList.add('animate');
          }

          window.setTimeout(function(){
            elPage.classList.add('active');
            elPage.classList.remove('hide');
          });
        });
      }

      evme.refreshQueryStringParams();

      // trigger the event AFTER the params have been refreshed, so if someone
      // queries "evme.params." they'll get the updated ones
      evme.utils.trigger(NAME, self.EVENTS.GOTO, {
        'page': page
      });

      for (var timing in pageCallbacks) {
        var directions = pageCallbacks[timing];
        for (var direction in directions) {
          var methods = directions[direction];
          for (var i = 0, cb; cb = methods[i++];) {
            cb(data);
          }
        }
      }
    };

    // given an object of key=value, convert it to a URL format (?key=value&...)
    this.convertObjectToUrl = function convertObjectToUrl(params) {
      if (!params || Object.keys(params).length === 0) {
        return '';
      }

      var urlSanitizedParams = [];

      for (var k in params) {
        urlSanitizedParams.push(k + '=' + encodeURIComponent(params[k] || ''));
      }

      return '?' + urlSanitizedParams.join('&');
    };

    // given a url string, return an object
    this.convertUrlToObject = function convertUrlToObject(url) {
      var urlParams = {};

      url = (url || '').replace('?', '');

      if (!url) {
        return urlParams;
      }

      url = url.split('&');
      for (var i=0, param; param=url[i++];) {
        param = param.split('=');
        urlParams[decodeURIComponent(param[0] || '')] = decodeURIComponent(param[1] || '');
      }

      return uruParams;
    };

    /**
     * implement a history back mechanism
     */
    this.back = function back() {
      window.history.back();
    };

    /**
     * implement a refresh mechanism
     * @param {boolean} force [when true, causes the page to always be reloaded from the server. If false or not specified, the browser may reload the page from its cache.]
     */
    this.refresh = function refresh(force) {
      window.location.reload(force);
    };

    function onAddressChanged(data) {
      if (self.current_href !== window.location.search && historyEnabled && data) {
        var urlParams = data.state && data.state.url || {},
            page = urlParams.page ||
                   evme.utils.parseQueryString().page ||
                   self.getDefaultPage();

        self.navigateTo(page, urlParams);
      }
    }

    function addMultiplePagesLogic() {
      evme.log(NAME, 'add multiple pages logic...');

      var firstPage = evme.utils.parseQueryString().page,
          elPageToShow = firstPage && document.querySelector('.evme-pages #' + firstPage);

      if (!elPageToShow) {
        elPageToShow = elPages[0];
      }

      firstPage = elPageToShow.id;

      elPageToShow.classList.add('active');

      for (var i = 0, el; el = elPages[i++];) {
        if (el.id === firstPage) {
          continue;
        }

        el.classList.add('hide');
        el.classList.add('hide-left');
      }

      addMultiplePagesStyle();

      evme.log(NAME, 'add multiple pages logic- done');
    }

    function addMultiplePagesStyle() {
      var elStyle = document.createElement('style'),
          pageTop = ((evme.$('.evme-header') || [])[0] || {offsetHeight: 0}).offsetHeight,
          style = [
            '.evme-pages {',
              'position: absolute;',
              'top: ' + pageTop + 'px;',
              'left: 0;',
              'right: 0;',
              'bottom: 0;',
              'overflow: hidden;',
            '}',
            '.evme-pages .page {',
              'position: absolute;',
              'top: 0;',
              'left: 0;',
              'right: 0;',
              'bottom: 0;',
              'overflow: auto;',
            '}',
            '.evme-pages .page.animate {',
              '-webkit-transition: -webkit-transform 450ms ease;',
              'transition: transform 450ms ease;',
            '}',
            '.evme-pages .page.hide {',
              'pointer-events: none;',
            '}',
            '.evme-pages .page.hide.hide-left {',
              '-webkit-transform: translateX(-100%);',
              'transform: translateX(-100%);',
            '}',
            '.evme-pages .page.hide.hide-right {',
              '-webkit-transform: translateX(100%);',
              'transform: translateX(100%);',
            '}'
          ];

      if (self.FLIP_FOR_RTL) {
        style.push(
          '.evme-rtl .evme-pages .page.hide.hide-left {',
            '-webkit-transform: translateX(100%);',
            'transform: translateX(100%);',
          '}',
          '.evme-rtl .evme-pages .page.hide.hide-right {',
            '-webkit-transform: translateX(-100%);',
            'transform: translateX(-100%);',
          '}'
        );
      }

      elStyle.id = 'evme-nav-style';
      elStyle.type = 'text/css';
      elStyle.innerHTML = elStyle.textContent = style.join("\n");

      document.querySelector('head').appendChild(elStyle);
    }
  }

  scope[moduleName] = new Module();
}(window.evme, 'nav'));

// evme.analytics
(function(scope, moduleName) {
  var NAME = 'analytics';

  function Module() {
    var self = this,
        provider,
        pageviewKeys,

        DEFAULT_PAGE_TO_REPORT = 'search',
        DEFAULT_PAGEVIEW_KEYS = ['do_query'],

        ENABLED = false;

    this.NAME = NAME;

    this.init = function init(options) {
      !options && (options = {});

      pageviewKeys = options.pageviewKeys || DEFAULT_PAGEVIEW_KEYS;
    };

    this.enable = function enable() {
      if (!provider) {
        provider = new ProviderGoogleAnalytics();
        provider.load();
      }

      // listen to navigation events for automatic page view reports
      var nav = scope.nav;
      if (nav) {
        nav.bind(nav.EVENTS.GOTO, onNavigation, true);
      }

      ENABLED = true;
    };

    this.disable = function disable() {
      ENABLED = false;
    };

    this.report = function reportPageView(category, action, label) {
      ENABLED && provider && provider.report(category, action, label);
    };

    this.reportPageView = function reportPageView(page) {
      ENABLED && provider && provider.reportPageView(page || scope.nav.current_page);
    };

    function onNavigation(e) {
      var page = (((e || {}).detail || {}).page || DEFAULT_PAGE_TO_REPORT),
          query = scope.params.do_query;

      page = '/' + page + '/';

      // add dynamic params to the page view reporting
      // these can get passed by the app itself, to decide if a pageview
      // has other important params in the URL, other than the default "do_query"
      // page + param1 = page/param1/
      // page + param2 = page//param2/
      // page + param1 + param2 = page/param1/param2/
      var params = '',
          didAddParam = false;

      for (var i = 0, key, value; key = pageviewKeys[i++];) {
        value = scope.params[key];

        if (value || (!didAddParam && !value)) {
          params += encodeURIComponent(value || '') + '/';
        }

        if (value) {
          didAddParam = true;
        }
      }
      // only add the params to the URL if there's at least one not empty
      if (params.replace(/\//g, '') !== '') {
        page += params;
      }

      self.reportPageView(page);
    }
  }

  function ProviderGoogleAnalytics() {
    var account,
        lastEventReported = '',

        ACCOUNTS = {
          'loc\.flyapps\.me': {
            id: 'UA-16876190-2',
            domain: '.loc.flyapps.me'
          },
          'test\.flyapps\.me': {
            id: 'UA-16876190-8',
            domain: '.test.flyapps.me'
          },
          'stg\.flyapps\.me': {
            id: 'UA-16876190-7',
            domain: '.stg.flyapps.me'
          },
          'flyapps\.me': {
            id: 'UA-16876190-4',
            domain: '.flyapps.me'
          }
        };

    this.report = function report(category, action, label) {
      addEvent(['_trackEvent', category, action, label]);
    };

    this.reportPageView = function reportPageView(page) {
      addEvent(['_trackPageview', page || '']);
    };

    this.load = function load() {
      setAccount();

      addEvent(['_setAccount', account.id]);
      addEvent(['_setDomainName', account.domain]);
      addEvent(['_setCustomVar', 1, 'appname', evme.utils.getAppName()]);

      var elScript = document.createElement('script');
      elScript.type = 'text/javascript';
      elScript.src = '//google-analytics.com/ga.js';
      document.body.appendChild(elScript);

      evme.info(NAME, 'Load analytics: ' + JSON.stringify(account))
    };

    function addEvent(params) {
      if (typeof _gaq === 'undefined') {
        _gaq = [];
      }

      if (params.join(',') === lastEventReported) {
        return;
      }

      lastEventReported = params.join(',');

      _gaq.push(params);

      evme.log(NAME, 'pushed event: ' + params);
    }

    function setAccount() {
      var host = window.location.host;
      for (var rule in ACCOUNTS) {
        account = ACCOUNTS[rule];
        if (new RegExp(rule).test(host)) {
          break;
        }
      }
    }
  }

  scope[moduleName] = new Module();
}(window.evme, 'analytics'));
