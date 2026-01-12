import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import * as chokidar from 'chokidar';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const WATCH_TARGET_DIR = 'xml_data'; // 監視するフォルダ名
let ARCHIVE_DIR = 'archive'; // 移動先フォルダ名

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
});

// ブラウザに表示するHTMLファイルを置く設定
app.use(express.static('public'));

/**
 * フォルダの監視設定
 */
function startWatcher() {
    // フォルダが存在しない場合は作成
    if (!fs.existsSync(WATCH_TARGET_DIR)) {
        fs.mkdirSync(WATCH_TARGET_DIR);
    }

    console.log(`👀 フォルダの監視を開始しました: ${WATCH_TARGET_DIR}`);

    // chokidarの設定
    const watcher = chokidar.watch(WATCH_TARGET_DIR, {
        ignored: /(^|[\/\\])\../, // 隠しファイルを無視
        persistent: true,
        ignoreInitial: true,     // 起動時に既に存在するファイルは無視
        awaitWriteFinish: {      // 書き込みが完了するまで待機（重要！）
            stabilityThreshold: 1000,
            pollInterval: 100
        }
    });

    // ファイルが追加された時のイベント
    let eventData = "";
    let targetDir = "";
    let fileName = "";
    let destPath = "";
    let receivedtime = new Date().toISOString().replace(/[-:T.Z]/g, ''); // YYYYMMDDTHHMMSSsss形式
    watcher.on('add', (filePath) => {
    // ARCHIVE_DIR が定義されていることを確認（なければここで定義）

    if (path.extname(filePath).toLowerCase() === '.xml') {
        // 1. 解析を実行し、戻り値を受け取る
        const eventData = processXmlFile(filePath);

        // 解析に失敗した場合や該当データがない場合は処理を中断
        if (!eventData) return;

        // 2. 変数を定義（必ずこの if ブロックの中で使う）
        const eventIdStr = String(eventData.EventID);
        const targetDir = path.join(ARCHIVE_DIR, eventIdStr);
        const newFileName = `${eventData.telegramType}_${receivedtime}.xml`;
        const destPath = path.join(targetDir, newFileName);

        console.log(`移動先フォルダ候補: ${targetDir}`);
        
        // 3. フォルダ作成（if の中で実行する！）
        if (!fs.existsSync(targetDir)) {
            // targetDir が空文字でないことを確認してから作成
            if (targetDir) {
                fs.mkdirSync(targetDir, { recursive: true });
                console.log(`フォルダ作成完了: ${targetDir}`);
                // 4. タイマー処理（これも if の中！）
                setTimeout(() => {
                    try {
                        if (fs.existsSync(filePath)) {
                            fs.renameSync(filePath, destPath);
                            console.log(`✅ 移動完了: ${newFileName}`);
                        }else{
                            
                        }
                    } catch (err) {
                        console.error(`❌ 移動失敗: ${filePath}`, err);
                    }
                }, 5000);
            }else{
                console.error('❌ 移動先フォルダが空文字です。フォルダを作成できません。');
            }
        }else{
            setTimeout(() => {
                    try {
                        if (fs.existsSync(filePath)) {
                            fs.renameSync(filePath, destPath);
                            console.log(`✅ 移動完了: ${newFileName}`);
                        }
                    } catch (err) {
                    console.error(`❌ 移動失敗: ${filePath}`, err);
                }
            }, 5000);
        }

        
        
    } // ← ここで初めて if (path.extname...) を閉じる
});

    watcher.on('error', error => console.error(`監視エラー: ${error}`));
}

// 実行
startWatcher();

/**
 * 震度の強さを数値化
 */
function intensityToValue(int: string): number {
    const map: { [key: string]: number } = {
        '7': 9, 
        '6+': 8, 
        '6-': 7, 
        '5+': 6, 
        '5-': 5, 
        '震度５弱以上未入電': 45, //震源・震度情報用
        '4': 4, 
        '3': 3, 
        '2': 2, 
        '1': 1
    };
    return map[String(int)] || 0;
}

/**
 * 震度の表示を日本語に変換する
 */
function formatIntensity(int: string): string {
    const map: { [key: string]: string } = {
        '7': '7',
        '6+': '6強',
        '6-': '6弱',
        '5+': '5強',
        '5-': '5弱',
        '4': '4',
        '3': '3',
        '2': '2',
        '1': '1'
    };
    return map[String(int)] || int;
}

/**
 * XML解析とブラウザへの送信
 */
function VXSE51(xmlString: string) {
    try {
        const jsonObj = parser.parse(xmlString);
        const report = jsonObj.Report;
        const head = report.Head;
        const body = report.Body;

        const intensity = body?.Intensity?.Observation;
        let sortedAreas = [];

        if (intensity) {
            const allAreas: any[] = [];
            const prefs = Array.isArray(intensity.Pref) ? intensity.Pref : [intensity.Pref];
            prefs.forEach((pref: any) => {
                const areas = Array.isArray(pref.Area) ? pref.Area : [pref.Area];
                areas.forEach((area: any) => {
                    const rawInt = String(area.MaxInt);
                    allAreas.push({
                        name: area.Name,
                        pref: pref.Name,
                        maxInt: rawInt,               // ソート用の生データ
                        displayInt: formatIntensity(rawInt) // 表示用の「強/弱」データ
                    });
                });
            });

            // 震度順にソート
            sortedAreas = allAreas.sort((a, b) => intensityToValue(b.maxInt) - intensityToValue(a.maxInt));
        }

        // ブラウザ（Socket.io）にデータを送信
        const earthquakeData = {
            title: head.Title,
            eventId: head.EventID,
            targetTime: head.TargetDateTime,
            status: report.Control.Status,
            areas: sortedAreas
        };

        io.emit('quake_update', earthquakeData);
        console.log(`✅ ブラウザへデータを送信しました: ${head.Title}`);

    } catch (e) {
        console.error('解析失敗:', e);
    }
}

function VXSE43(xmlString: string) {
    let EEWmode = "府県予報区" //地方予報区・府県予報区・細分区域
    try {
        const jsonObj = parser.parse(xmlString);
        const report = jsonObj.Report;
        const head = report.Head;
        const body = report.Body;
        let areas;

        const warningComment = report.Body?.Comments?.WarningComment;
        
        let commentText = "";
        if (warningComment) {
            // 単一のオブジェクトか配列かを判定して取得
            if (Array.isArray(warningComment)) {
                commentText = warningComment.map((c: any) => c.Text).join(' ');
            } else {
                commentText = warningComment.Text;
            }
        }

        // Headline内のInformationを取得（配列保証）
        const infoList = Array.isArray(report.Head.Headline.Information)
            ? report.Head.Headline.Information
            : [report.Head.Headline.Information];

        // 設定したEEWmodeに対応する「type」を定義
        const targetType = `緊急地震速報（${EEWmode}）`;
        console.log(`表示モード: ${EEWmode}`);

        infoList.forEach((info: any) => {
            // 現在のInformationのタイプが、選択中のEEWmodeと一致するか確認
            if (info.type === targetType) {
                const items = Array.isArray(info.Item) ? info.Item : [info.Item]; 
                items.forEach((item: any) => {
                    areas = Array.isArray(item.Areas.Area)
                        ? item.Areas.Area
                        : [item.Areas.Area];
                });
            };   
        });

        let ReduceName ="";
        switch(EEWmode) {
            case "地方予報区":
                ReduceName = report.Body.Earthquake.Hypocenter.Area.ReduceName;
                break;
            case "府県予報区":
                ReduceName = report.Body.Earthquake.Hypocenter.Area.Name;
                break
            case "細分区域":
                ReduceName = report.Body.Earthquake.Hypocenter.Area.Name;
                break;
            }

        // ブラウザ（Socket.io）にデータを送信
        const earthquakeData = {
            title: head.Title,
            eventId: head.EventID,
            targetTime: head.TargetDateTime,
            status: report.Control.Status,
            ReduceName: ReduceName,
            commentText: commentText,
            areas: areas,

        };

        io.emit('quake_update', earthquakeData);
        console.log(`✅ ブラウザへデータを送信しました: ${head.Title}`);

    } catch (e) {
        console.error('解析失敗:', e);
    }
}

function VXSE53(xmlString: string) {
    try {
        const jsonObj = parser.parse(xmlString);
        const report = jsonObj.Report;
        const head = report.Head;
        const body = report.Body;
        const intensity = body?.Intensity?.Observation;
        console.log(body.Comments.ForecastComment.Text);
        console.log(body.Earthquake.Hypocenter.Area.Name);
        // console.log(body.Earthquake.jmx_eb:Magunitude);
        // const Comment = report.Body?.Comments?.ForcastComment.Text;
        


        let allPoints: any[] = [];

        if (intensity) {
            // 1. 都道府県(Pref)を配列に保証
            const prefs = Array.isArray(intensity.Pref) ? intensity.Pref : [intensity.Pref];

            prefs.forEach((pref: any) => {
                const prefName = pref.Name;

                // 2. 地域(Area)を配列に保証
                const areas = Array.isArray(pref.Area) ? pref.Area : [pref.Area];

                areas.forEach((area: any) => {
                    const areaName = area.Name;

                    // 3. 市町村(City)を配列に保証
                    const cities = Array.isArray(area.City) ? area.City : [area.City];

                    cities.forEach((city: any) => {
                        const cityName = city.Name;
                        const cityMaxInt = city.MaxInt;

                        // 4. 観測点(IntensityStation)を配列に保証
                        if (city.IntensityStation) {
                            const stations = Array.isArray(city.IntensityStation)
                                ? city.IntensityStation
                                : [city.IntensityStation];

                            stations.forEach((station: any) => {
                                allPoints.push({
                                    pref: prefName,
                                    area: areaName,
                                    city: cityName,
                                    cityMaxInt: cityMaxInt,
                                    name: station.Name, // 観測点名
                                    maxInt: station.Int // その地点の震度
                                });
                            });
                        }
                    });
                });
            });

            // 震度順（強い順）にソート
            allPoints.sort((a, b) => intensityToValue(b.maxInt) - intensityToValue(a.maxInt));
        }

        // ブラウザへ送信するデータ
        const earthquakeData = {
            title: head.Title,
            eventId: head.EventID,
            targetTime: head.TargetDateTime,
            status: report.Control.Status,
            ReduceName: body.Earthquake.Hypocenter.Area.Name,
            // Magunitude: body.Earthquake.jmx_eb,
            commentText: body.Comments.ForecastComment.Text,
            area: allPoints // 全地点データ
        };

        io.emit('quake_update', earthquakeData);
        console.log(`✅ ${head.Title} を送信しました (${allPoints.length} 地点)`);


    } catch (e) {
        console.error('VXSE53解析失敗:', e);
        return null;
    }
}

/**
 * ファイルを解析するメイン関数
 */
function processXmlFile(filePath: string) {
    try {
        console.log(`\n📄 新着ファイルを検知: ${path.basename(filePath)}`);
        
        // ファイルが書き込み中の場合を考慮し、少し待つか読み込みに失敗したらリトライする
        const xmlString = fs.readFileSync(filePath, 'utf-8');
        const jsonObj = parser.parse(xmlString);
        const report = jsonObj.Report;
        const title = report.Head.Title;
        const EventID = report.Head.EventID;
        let telegramType = "";

        console.log(`--- 解析開始: ${title} ---`);

        switch(title) {
            case '震度速報':
                VXSE51(xmlString);
                telegramType = 'VXSE51';
                break;
            case '緊急地震速報（警報）':
                VXSE43(xmlString);
                telegramType = 'VXSE43';
                break;
            case '震源・震度情報':
                VXSE53(xmlString);
                telegramType = 'VXSE53';
                break;
            // 他の電文もここに追加
            default:
                console.log(`未対応の電文です: ${title}`);
        }

        return {
                EventID:EventID,
                telegramType:telegramType
                };
    } catch (error) {
        console.error('解析中にエラーが発生しました:', error);
    }
}

// 接続テスト用に、ブラウザが接続された3秒後にローカルXMLを読み込んで配信する
io.on('connection', (socket) => {
    console.log('🌐 ブラウザが接続されました');
    
    // setTimeout(() => {
    //     const xmlString = fs.readFileSync('VXSE43_20260106101855503.xml', 'utf-8');
    //     const jsonObj = parser.parse(xmlString);
    //     const report = jsonObj.Report;

    //     console.log(`受信した電文タイトル: ${report.Control.Title}`);

    //     switch(report.Control.Title){
    //         case '震度速報':
    //             VXSE51(xmlString);
    //             break;
    //         case '緊急地震速報（警報）':
    //             VXSE43(xmlString);
    //             break;
    //         default:
    //             console.log('対応していない電文タイトルです');
    //     }
        
    // }, 3000);
});

httpServer.listen(3000, () => {
    console.log('🚀 サーバーが起動しました: http://localhost:3000');
});