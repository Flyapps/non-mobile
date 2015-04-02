// l10n - localization of HTML using data-l10n attributes
(function(scope, moduleName) {
  var DEFAULT_PROPERTY_TO_SET = 'innerHTML';

  function Module(options) {
    var NAME = 'l10n',
        self = this,
        version = null,
        path = '',

        // these two together consist of the user's locale, like en-US
        currLang = '',
        currCountry = '',

        // the actual translations
        localStrings = null,
        defaultStrings = null,

        // defaults for when trying to set language or country
        defaultLang = '',
        defaultCountry = '';

    var RTL = ['he', 'ar'];

    this.NAME = NAME;

    this.EVENTS = {
      LOAD: 'load'
    };

    this.loaded = false;

    this.isRTL = false;

    function init() {
      evme.log(NAME, 'init');

      !options && (options = {});

      path           = options.folderPath  || 'locales';
      defaultLang    = options.defaultLang || 'en';
      defaultCountry = options.defaultCountry || 'US';
      version        = options.version     || evme.getBuildNum();

      loadDefaultTranslations();

      self.set(options.lang || evme.params.lang,
               options.country || evme.params.country);
    }

    this.set = function set(language, country) {
      self.setLanguage(language, false);
      self.setCountry(country, false);

      loadTranslationFile();
    };

    this.setLanguage = function setLanguage(lang, updateTranslations) {
      currLang = (lang ||
                 ((getBrowserLang() || '').split('-'))[0] ||
                  defaultLang).toLowerCase();

      if (updateTranslations !== false) {
        loadTranslationFile();
      }

      evme.log(NAME, 'language set: ' + currLang);
    };

    this.setCountry = function setCountry(country, updateTranslations) {
      currCountry = evme.utils.getCountryCode(
                      country ||
                      ((getBrowserLang() || '').split('-'))[1] ||
                      defaultCountry
                    );

      if (updateTranslations !== false) {
        loadTranslationFile();
      }

      evme.log(NAME, 'country set: ' + currCountry);
    };

    this.getLanguage = function getLanguage() {
      return currLang;
    };

    this.getCountry = function getCountry() {
      return currCountry;
    };

    this.getDefault = function getDefault(key, args, property) {
      !property && (property = DEFAULT_PROPERTY_TO_SET);

      var value = '';

      key = key.split('.');
      key[1] && (property = key[1]);
      key = key[0];

      value = ((defaultStrings || {})[key] || {})[property] || '';

      if (args) {
        try {
          if (typeof args === 'string') {
            args  = JSON.parse(args);
          }

          value = parseArgs(value, args);
        } catch(e){
        }
      }

      return value;
    };

    this.getLocal = function getLocal(key, args, property) {
      !property && (property = DEFAULT_PROPERTY_TO_SET);

      var value = '';

      key = key.split('.');
      key[1] && (property = key[1]);
      key = key[0];

      value = ((localStrings || {})[key] || {})[property] || '';

      if (args) {
        try {
          if (typeof args === 'string') {
            args  = JSON.parse(args);
          }

          value = parseArgs(value, args);
        } catch(e){
        }
      }

      return value;
    };

    this.get = function get(key, args, property) {
      return self.getLocal(key, args, property) ||
             self.getDefault(key, args, property) ||
             '';;
    };

    this.on = {
      set: function onMessageSet(data) {
        if (data.localStrings) {
          localStrings = parseTranslations(data.localStrings);
        }
        if (data.defaultStrings) {
          defaultStrings = parseTranslations(data.defaultStrings);
        }
        if (data.language) {
          self.setLanguage(data.language, false);
        }
        if (data.country) {
          self.setCountry(data.country, false);
        }

        renderTranslations();
      },

      mark: function onMessageMark(data) {
        var key = data.key.split('.')[0],
            elToMark = document.querySelector('*[data-l10n-id = "' + key + '"]');

        if (elToMark) {
          var bounds = elToMark.getBoundingClientRect(),
              elMarker = document.createElement('span'),
              scrollTop = document.body.scrollTop,
              top = bounds.top + scrollTop;

          elMarker.setAttribute('data-for', key);
          elMarker.style.cssText +=
            'position: absolute;' +
            'top: ' + top + 'px;' +
            'left: ' + bounds.left + 'px;' +
            'width: ' + bounds.width + 'px;' +
            'height: ' + bounds.height + 'px;' +
            'z-index: 99999;' +
            'background: rgba(255, 255, 0, .4);';

          document.body.appendChild(elMarker);

          if (top < scrollTop || top > scrollTop + window.innerHeight) {
            document.body.scrollTop = top;
          }
        }
      },

      unmark: function onMessageUnmark(data) {
        var key = data.key.split('.')[0],
            elMarker = document.querySelector('*[data-for=' + key + ']');

        if (elMarker) {
          elMarker.parentNode.removeChild(elMarker);
        }
      }
    };

    // get the language from the browser
    function getBrowserLang() {
      return navigator && navigator.language || '';
    }

    // both local and default translations loaded
    function onTranslationsLoad() {
      evme.info(NAME, 'all translations loaded, parse and fire load event');

      if (!localStrings) {
        localStrings = {};
      }
      if (!defaultStrings) {
        defaultStrings = {};
      }

      renderTranslations();

      // fire a custom event alerting l10n is done
      evme.utils.trigger(NAME, self.EVENTS.LOAD, {
        'language': currLang,
        'country': currCountry,
        'post': true
      });
    }

    // get the loaded translations and implement everything
    function renderTranslations() {
      // translate elements with the l10n data attributes
      setHtmlText();

      // mark object as loaded (for apps that test it on their init)
      self.loaded = true;

      // add some RTL style if the language is defined in the RTL array above
      self.isRTL = (RTL.indexOf(currLang) !== -1);
      if (self.isRTL) {
        addRTLStyle();
      } else {
        removeRTLStyle();
      }
    }

    // load the default translation file, defined by defaultLang
    function loadDefaultTranslations() {
      var url = path + '/' + 'strings.' + defaultLang + '.json';
      if (version) {
        url += '?version=' + encodeURIComponent(version);
      }

      evme.log(NAME, 'loading default translations: ' + url);
      scope.utils.getJSON({
        "url": url,
        "success": function onSuccess(response) {
          evme.log(NAME, 'got default translations');

          setStrings(parseTranslations(response));
        },
        "error": function onError(responseText) {
          evme.error(NAME, 'Can\'t find default translations at: ' + url);

          setStrings({});
        }
      });

      function setStrings(strings) {
        defaultStrings = strings;

        if (localStrings) {
          onTranslationsLoad();
        }
      }
    }

    // load the local translation file - according to the user's locale
    function loadTranslationFile(useLanguageOnly, lang) {
      if (!lang) {
        lang = currLang;
      }

      // FOR DEBUGGING we're able to pass localization in the URL
      if (evme.params._strings) {
        try {
          localStrings = JSON.parse(evme.params._strings);
          localStrings = parseTranslations(localStrings);

          if (defaultStrings) {
            onTranslationsLoad();
          }

          return;
        } catch(ex) {

        }
      }

      // this means we're trying to load the default file
      // since it's already loaded - no need!
      if (lang === defaultLang && useLanguageOnly) {
        localStrings = defaultStrings;
        onTranslationsLoad();
        return;
      }

      var url = path + '/' + 'strings.' + lang;

      if (!useLanguageOnly) {
        url += '-' + currCountry;
      }

      url += '.json';

      if (version) {
        url += '?version=' + encodeURIComponent(version);
      }

      evme.log(NAME, 'loading local translations: ' + url);
      scope.utils.getJSON({
        "url": url,
        "success": function onSuccess(response) {
          evme.log(NAME, 'got local translations');

          localStrings = parseTranslations(response);

          if (defaultStrings) {
            onTranslationsLoad();
          }
        },
        "error": function onError(responseText) {
          evme.warn(NAME, 'XHR error!');
          onLoadTranslationsError(url, useLanguageOnly);
        }
      });
    }

    // there was an error loading a translation file
    function onLoadTranslationsError(url, useLanguageOnly) {
      evme.log(NAME, 'onLoadTranslationsError url: ' + url);

      if (useLanguageOnly) {
        if (currLang !== defaultLang) {
          loadTranslationFile(true, defaultLang);
        } else {
          evme.warn(NAME, 'Can\'t load any translation files!');
        }
      } else {
        loadTranslationFile(true);
      }
    }

    function parseTranslations(translations) {
      var parsed = {};

      for (var key in translations) {
        var value = translations[key],
            property = DEFAULT_PROPERTY_TO_SET;

        // check if the key contains a '.'
        // if it does, it means the dev wants a different property changed
        key = key.split('.');
        key[1] && (property = key[1]);

        // use the actual key, since we split it before
        key = key[0];

        if (!parsed[key]) {
          parsed[key] = {};
        }

        parsed[key][property] = value;
      }

      return parsed;
    }

    function setHtmlText() {
      var elements = document.querySelectorAll('*[data-l10n-id]') || [];
      elements = Array.prototype.slice.call(elements, 0);

      evme.log(NAME, 'updating texts for ' + elements.length + ' elements');

      for (var i=0, key, properties, args, el; el=elements[i++];) {
        key   = el.getAttribute('data-l10n-id');
        args  = el.getAttribute('data-l10n-args');
        properties = localStrings[key] || defaultStrings[key] || {};

        for (var property in properties) {
          el[property] = parseArgs(properties[property], args);
        }
      }

      evme.log(NAME, 'finished updating texts for ' + elements.length + ' elements');
    }

    function parseArgs(string, jsonParams) {
      if (!jsonParams) {
        jsonParams = {};
      } else if (typeof jsonParams === 'string') {
        try {
          jsonParams = JSON.parse(jsonParams);
        } catch(ex) {
          jsonParams = {};
        }
      }

      return string.replace(/{{([^{}]*)}}/g, function(match, actualVal) {
        return actualVal in jsonParams? jsonParams[actualVal] : '';
      });
    }

    function addRTLStyle() {
      var elStyle = document.createElement('style'),
          style = [
            '.evme-rtl .evme-text,',
            '.evme-rtl.evme-text {',
              'direction: rtl;',
            '}'
          ];

      elStyle.id = 'evme-l10n-style';
      elStyle.type = 'text/css';
      elStyle.innerHTML = elStyle.textContent = style.join("\n");

      document.querySelector('head').appendChild(elStyle);

      // add a class to the body so that the app itself can be aware of it
      document.body.classList.add('evme-rtl');
    }

    function removeRTLStyle() {
      var elStyle = document.getElementById('evme-l10n-style');
      if (elStyle) {
        elStyle.parentNode.removeChild(elStyle);
      }

      document.body.classList.remove('evme-rtl');
    }

    init();
  }

  scope[moduleName] = Module;
}(window.evme, 'l10n'));
