evme.init({
  "modules": ['L10N']
}, function onReady() {
  App.init();
});

var App = new function() {
    var self;

    this.init = function() {
      var btn = document.getElementById("btnConfirm");
          btn.addEventListener('click', redirect);
    };

    function redirect(e) {
      e.preventDefault();
      setCookie("visited-"+appId, 1, 365*10);

      console.log("Redirecting to: " + redirectUrl);
      window.location.href = redirectUrl;
    }

    function setCookie(c_name, value, exdays) {
      var exdate = new Date(),
          c_value;
      
      exdate.setDate(exdate.getDate() + exdays);

      c_value = escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());

      document.cookie=c_name + "=" + c_value;
    }
};
