import { SaberaClient, hex } from './sabera.js';

const client = new SaberaClient();
const $ = (id) => document.getElementById(id);
let isJapanese = /^ja(?:-|$)/i.test(navigator.language);
const messages = {
  en: {
    title: 'SABERA Web Bluetooth', statusDisconnected: 'Disconnected', statusConnected: 'Connected: ',
    connect: 'Connect', disconnect: 'Disconnect', languageToggle: '日本語', screen: 'Screen', genericTextScreen: 'Generic text screen',
    homeScreen: 'Home screen', text: 'Text', textInput: 'Text input', showText: 'Show text',
    clearText: 'Clear text', other: 'Other', sendNotification: 'Send sample notification', syncTime: 'Sync time',
    connectedLog: 'Connected', disconnectedLog: 'Disconnected', textScreenLog: 'Opened generic text screen',
    textSentLog: 'Text sent', textClearedLog: 'Clear text sent', homeLog: 'Opened home screen',
    notificationLog: 'Notification sent', timeLog: 'Time synchronized', unsupported: 'Web Bluetooth is not supported in this browser.',
  },
  ja: {
    title: 'SABERA Web Bluetooth', statusDisconnected: '未接続', statusConnected: '接続中: ',
    connect: '接続', disconnect: '切断', languageToggle: 'English', screen: '画面', genericTextScreen: '汎用テキスト画面',
    homeScreen: 'ホーム画面', text: 'テキスト', textInput: 'テキスト入力', showText: 'テキスト表示',
    clearText: 'テキスト消去', other: 'その他', sendNotification: 'サンプル通知を送信', syncTime: '時刻同期',
    connectedLog: '接続しました', disconnectedLog: '切断されました', textScreenLog: '汎用テキスト画面へ移動しました',
    textSentLog: 'テキストを送信しました', textClearedLog: 'テキスト消去を送信しました', homeLog: 'ホーム画面へ移動しました',
    notificationLog: '通知を送信しました', timeLog: '時刻を同期しました', unsupported: 'このブラウザはWeb Bluetoothに対応していません。',
  },
};
let i18n = messages[isJapanese ? 'ja' : 'en'];
const applyLanguage = () => {
  i18n = messages[isJapanese ? 'ja' : 'en'];
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const message = i18n[element.dataset.i18n];
    if (message) element.textContent = message;
  });
  $('language').textContent = i18n.languageToggle;
  $('message').setAttribute('aria-label', i18n.textInput);
  document.documentElement.lang = isJapanese ? 'ja' : 'en';
  document.title = i18n.title;
  setConnected(client.connected);
};
const log = (message) => { $('log').textContent += `${new Date().toLocaleTimeString()} ${message}\n`; $('log').scrollTop = $('log').scrollHeight; };
const setConnected = (connected) => {
  $('status').textContent = connected ? `${i18n.statusConnected}${client.device?.name ?? 'SABERA'}` : i18n.statusDisconnected;
  $('connect').disabled = connected;
  $('disconnect').disabled = !connected;
  for (const id of ['text-screen', 'send', 'home', 'clear', 'notify', 'time']) $(id).disabled = !connected;
};

client.addEventListener('connected', ({ detail }) => { setConnected(true); log(`${i18n.connectedLog} (${detail.name ?? 'SABERA'})`); });
client.addEventListener('disconnected', () => { setConnected(false); log(i18n.disconnectedLog); });
client.addEventListener('warning', ({ detail }) => log(`${isJapanese ? '通知購読なし' : 'Notifications unavailable'}: ${detail.message}`));
client.addEventListener('data', ({ detail }) => log(`${isJapanese ? '受信' : 'Received'}: ${hex(detail)}`));

$('language').onclick = () => {
  isJapanese = !isJapanese;
  applyLanguage();
};

$('connect').onclick = async () => {
  try { await client.connect(); } catch (error) { log(`接続エラー: ${error.message}`); }
};
$('disconnect').onclick = () => client.disconnect();
$('text-screen').onclick = async () => { try { await client.showScreen(0x0047); log(i18n.textScreenLog); } catch (e) { log(e.message); } };
$('send').onclick = async () => { try { await client.sendText($('message').value); log(i18n.textSentLog); } catch (e) { log(e.message); } };
$('home').onclick = async () => { try { await client.showScreen(0x0032); log(i18n.homeLog); } catch (e) { log(e.message); } };
$('clear').onclick = async () => { try { await client.clearText(); log(i18n.textClearedLog); } catch (e) { log(e.message); } };
$('time').onclick = async () => { try { await client.syncTime(); log(i18n.timeLog); } catch (e) { log(e.message); } };
$('notify').onclick = async () => {
  try { await client.sendMessage({ appName: 'Web sample', subject: 'SABERA', body: isJapanese ? 'ブラウザからの通知です' : 'A notification from the browser' }); log(i18n.notificationLog); }
  catch (e) { log(e.message); }
};

if (!('bluetooth' in navigator)) log(i18n.unsupported);
applyLanguage();
