<?php
  require_once "../common/includes.php";

  $debug = isset($_GET["debug"]);
  $userAgent = @$_SERVER["HTTP_USER_AGENT"];

  $name       = (!empty($_GET["name"]))       ? $_GET["name"]           : "";
  $appId      = (!empty($_GET["appId"]))      ? $_GET["appId"]          : "";
  $url        = (!empty($_GET["url"]))        ? urldecode($_GET["url"]) : "";

  if (!$debug) {
    // redirect directly to the app if the user already saw this,
    // or if on Android
    if (isset($_COOKIE["visited-$appId"]) ||
        strpos($userAgent, 'Android') !== false) {
      header("HTTP/1.1 302 Found");
      header('Location: ' . $url);
      exit;
    }
  }
?>
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="style/building-blocks/confirm.css">
  <link rel="stylesheet" href="style/building-blocks/buttons.css">
  <link rel="stylesheet" href="style/building-blocks/switches.css">
  <link rel="stylesheet" href="style/building-blocks/util.css">
  <link rel="stylesheet" href="style/building-blocks/fonts.css">
  <link rel="stylesheet" href="style/building-blocks/cross_browser.css">

  <link rel="stylesheet" href="style/common.css">

  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <meta charset="UTF-8">
</head>
<body>
  <form role="dialog" data-type="confirm">
    <section>
      <h1 data-l10n-id="sorry"></h1>
      <p data-l10n-id="no-available-app" data-l10n-args='{"name":"<?=$name;?>"}'></p>
    </section>
    <menu>
      <button id="btnConfirm" class="full recommend" data-l10n-id="go-to-website"></button>
    </menu>
  </form>
  <script>
    var redirectUrl = '<?=$url;?>',
        appId = '<?=$appId;?>',
        debug = <?=($debug ? 'true' : 'false');?>;
  </script>
  <?php
    Utils::printEvmeJsScriptTag();
    Utils::includeFile('js/common.js', null, -1);
  ?>
</body>
</html>