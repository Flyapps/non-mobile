var App = new function() {
    var redirectUrl = getQueryString('url');

    this.init = function() {
      evme.init({
        "modules": ['L10N']
      },onReady);
    };

    function onReady() {
      document.getElementById("btnConfirm")
        .addEventListener('click', function(e) {
          e.preventDefault();
          setCookie(redirectUrl);
          window.location.href = redirectUrl;
        });
    }
};

function setCookie(redirectUrl) {
  var value =1,
      exdays = 365*10,
      exdate = new Date(),
      c_name = 'visited-'+encodeURIComponent(redirectUrl),
      c_value;

  exdate.setDate(exdate.getDate() + exdays);

  c_value = escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());

  document.cookie=c_name + "=" + c_value;
}

function getCookie(redirectUrl) {
  var c_name = 'visited-'+encodeURIComponent(redirectUrl);
  var value = "; " + document.cookie;
  var parts = value.split("; " + c_name + "=");
  if (parts.length == 2) return parts.pop().split(";").shift();
}

function getQueryString(name) {
  var regex = new RegExp(name+'=([^&]*)')
  var match = window.location.search.match(regex)
  if (match.length > 1) {
    return match[1];
  }
  return null;
}
