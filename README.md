# SABERA Web Bluetooth SDK

ブラウザのWeb Bluetooth APIからSABERAグラスへ接続し、テキストや通知を送信するESモジュールです。

## URLインポートで使う

GitHub Pagesで公開したモジュールを、次のようにURLインポートして利用できます。

```html
<!doctype html>
<button id="connect">Connect SABERA</button>
<button id="show">Show text</button>

<script type="module">
  import { SaberaClient } from
    'https://code4fukui.github.io/webglass-sdk/sabera.js';

  const sabera = new SaberaClient();

  document.querySelector('#connect').onclick = async () => {
    await sabera.connect();
  };

  document.querySelector('#show').onclick = async () => {
    await sabera.showScreen(0x47); // Generic text screen
    await sabera.sendText('Hello SABERA');
  };
</script>
```

`connect()`は、ユーザーのクリックなどから呼び出してください。ブラウザのBluetoothデバイス選択画面が表示されます。

## 主なAPI

```js
await sabera.connect();
await sabera.showScreen(0x47); // Generic text screen
await sabera.sendText('Hello SABERA');
await sabera.clearText();
await sabera.showScreen(0x32); // Home screen
await sabera.syncTime();
await sabera.sendMessage({
  appName: 'My app',
  subject: 'Message',
  body: 'A message from the browser',
});
await sabera.disconnect();
```

`sendText()`はテキスト表示コマンドだけを送信します。汎用テキスト画面を使う場合は、先に`showScreen(0x47)`を呼び出してください。

受信通知は`data`イベントで受け取れます。

```js
sabera.addEventListener('data', (event) => {
  console.log(event.detail); // DataView
});

// The callback receives tap, doubleTap, or longPress.
const stopGestureEvents = sabera.onGesture(({ name, code }) => {
  console.log(name, code);
});

// Stop receiving gesture callbacks when no longer needed.
stopGestureEvents();
```

`onGesture()`のコールバックで受け取れる`name`は`tap`、`doubleTap`、`longPress`のいずれかです。

## 実行条件

- Web Bluetooth対応ブラウザ（Chromium系など）
- HTTPSのページ、または`localhost`
- Bluetoothが有効で、SABERAが近くで起動していること
- 接続操作をユーザーのクリックなどから実行すること

GitHub Pages上のサンプル：

<https://code4fukui.github.io/webglass-sdk/>

## ローカルで確認する

```sh
python3 -m http.server 8000
```

ブラウザで<http://localhost:8000/>を開きます。

## 仕様

パケット形式とUUIDは、SABERA SDKの公開Bluetoothコマンド仕様に基づいています。

<https://github.com/taisukef/sabera-sdk/blob/main/docs/bluetooth-commands.md>
