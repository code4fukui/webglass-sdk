# SABERA Web Bluetooth sample

`SaberaClient` は、SABERAの公開Bluetoothコマンド仕様をブラウザのWeb Bluetooth APIから利用する依存なしのESモジュールです。

## 実行

Web Bluetoothは`localhost`またはHTTPSのsecure contextが必要です。

```sh
python3 -m http.server 8000
```

ブラウザで <http://localhost:8000/> を開き、「接続」を押してください。対応ブラウザはChromium系（デスクトップChrome/Edge、Android Chromeなど）です。macOSではBluetoothをオンにし、SABERAを近くで起動してください。

## API例

```js
import { SaberaClient } from './sabera.js';

const sabera = new SaberaClient();
await sabera.connect(); // ユーザー操作から呼び出す
await sabera.syncTime();
await sabera.sendText('Hello SABERA');
await sabera.sendMessage({ appName: 'My app', subject: '件名', body: '本文' });
```

汎用テキスト画面を開く場合は`showScreen(0x47)`を呼び出し、その後に`sendText()`を呼び出します。`sendText()`はテキスト表示コマンドだけを送信します。

`data`イベントでコマンド受信Characteristicの通知を受け取れます。`sendCommand()`に仕様準拠のバイト列を渡すこともできます。なお、Bluetoothコマンドの直接送信は、対象機器やファームウェアの仕様を確認したうえで利用してください。
