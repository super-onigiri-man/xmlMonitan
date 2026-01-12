import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';

// --- 設定 ---
const SAMPLE_FILE_PATH = path.join('VXSE43_20251203150508105.xml'); // 同じフォルダのsample.xml

const mode = 0; // 0: 震度順表示 / 1: 震度別地域表示
const EEWmode = "府県予報区" //地方予報区・府県予報区・細分区域

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
});

/**
 * ローカルファイルを読み込んで解析を実行する
 */
function runLocalTest() {
    try {
        // 1. ファイル読み込み
        if (!fs.existsSync(SAMPLE_FILE_PATH)) {
            console.error('エラー: sample.xml が見つかりません。');
            return;
        }
        const xmlString = fs.readFileSync(SAMPLE_FILE_PATH, 'utf-8');

        const jsonObj = parser.parse(xmlString);
        const report = jsonObj.Report;

        // 電文の基本情報
        const status = report.Control.Status;      // 通常・訓練・試験
        const title = report.Head.Title;           // 震度速報

        // 2. 解析開始
        console.log('--- ローカルXMLの解析を開始します ---');

        switch(title) {
            case '震度速報':
                VXSE51(xmlString);
                break;
            case '緊急地震速報（警報）':
                VXSE43(xmlString);
                break;
            default:
                console.log(`対応していない電文タイトルです: ${title}`);
        }
    } catch (error) {
        console.error('ファイル読み込みエラー:', error);
    }
}

function intensityToValue(int: string): number {
    const map: { [key: string]: number } = {
        '7': 9,
        '6+': 8,
        '6-': 7,
        '5+': 6,
        '5-': 5,
        '4': 4,
        '3': 3,
        '2': 2,
        '1': 1
    };
    return map[int] || 0;
}

/**
 * 解析メインロジック（DM-data受信時と共通）
 */
function VXSE51(xmlString: string) {
    try {
        const jsonObj = parser.parse(xmlString);
        const report = jsonObj.Report;

        // 電文の基本情報
        const status = report.Control.Status;      // 通常・訓練・試験
        const title = report.Head.Title;           // 震度速報
        const eventId = report.Head.EventID;       // EventID
        const targetTime = report.Head.TargetDateTime; // 発生時刻

        console.log(`【電文情報】`);
        console.log(`ステータス: ${status}`);
        console.log(`電文タイトル: ${title}`);
        console.log(`EventID: ${eventId}`);
        console.log(`発生時刻: ${targetTime}`);
        console.log('---------------------------');

        // 震度情報の解析
        const intensity = report.Body?.Intensity?.Observation;

        if(mode == 0){
            if (intensity) {
            // 1. 全地域のデータをフラットな配列に集める
            const allAreas: { name: string, pref: string, maxInt: string }[] = [];
            const prefs = Array.isArray(intensity.Pref) ? intensity.Pref : [intensity.Pref];

            prefs.forEach((pref: any) => {
                const areas = Array.isArray(pref.Area) ? pref.Area : [pref.Area];
                areas.forEach((area: any) => {
                    allAreas.push({
                        name: area.Name,
                        pref: pref.Name,
                        maxInt: area.MaxInt
                    });
                });
            });

            // 2. 震度が大きい順にソートする
            allAreas.sort((a, b) => {
                return intensityToValue(b.maxInt) - intensityToValue(a.maxInt);
            });

            // 3. 表示
            console.log('【震度順の地域一覧】');
            allAreas.forEach(item => {
                // 震度5弱以上などは目立つように表示を工夫することも可能
                // const mark = intensityToValue(item.maxInt) >= 5 ? '🚩' : '  ';
                console.log(`震度 ${String(item.maxInt).padEnd(2)} : ${item.pref} - ${item.name}`);
            });
        }

        else{
            if (intensity) {
            console.log('【震度別の地域名】');

            // Pref（都道府県）が単一か複数か判定して配列化
            const prefs = Array.isArray(intensity.Pref) ? intensity.Pref : [intensity.Pref];

            prefs.forEach((pref: any) => {
                // Area（地域）が単一か複数か判定して配列化
                const areas = Array.isArray(pref.Area) ? pref.Area : [pref.Area];

                areas.forEach((area: any) => {
                    // 最大震度(MaxInt)ごとに整理して表示
                    console.log(`震度 ${area.MaxInt} : ${area.Name}`);
                });
            });
            } else {
            console.log('震度情報（Intensity）が含まれていない電文です。');
            }
        }
    }
        

    } catch (error) {
        console.error('解析中にエラーが発生しました:', error);
    }
}

function VXSE43(xmlString: string) {
    try {
        const jsonObj = parser.parse(xmlString);
        const report = jsonObj.Report;
        // 電文の基本情報
        const status = report.Control.Status;      // 通常・訓練・試験
        const title = report.Head.Title;           // 緊急地震速報（警報）
        const eventId = report.Head.EventID;       // EventID
        const targetTime = report.Head.TargetDateTime; // 発生時刻  
        console.log(`【電文情報】`);
        console.log(`ステータス: ${status}`);
        console.log(`電文タイトル: ${title}`);
        console.log(`EventID: ${eventId}`);
        console.log(`発生時刻: ${targetTime}`);
        console.log('---------------------------');
        // ここに緊急地震速報（警報）用の解析ロジックを追加できます
        const ReduceName = report.Body.Earthquake.Hypocenter.Area.ReduceName; // 震源地名
        // const WarningComment = report.Body.Comments.WarningComment.Text; // 警報コメント
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
        // const ReduceName = report.Earthquake.Area.ReduceName;
        // const prefName = report.Earthquake.Area.PrefName;
        // console.log(`震源地名: ${ReduceName}`);
        // console.log(`発生時刻: ${targetTime}`);

        // console.log(`${report.Head.Headline.Information}`)

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
                    const areas = Array.isArray(item.Areas.Area)
                        ? item.Areas.Area
                        : [item.Areas.Area];

                    console.log(`--- ${EEWmode}の警報対象 ---`);
                    console.log(`${ReduceName}で地震、${commentText}`);
                    console.log(`警報対象地域:`);
                    areas.forEach((area: any) => {
                         console.log(`${area.Name}`);
                    });
                });
            }
        });

    } catch (error) {
        console.error('解析中にエラーが発生しました:', error);
    }
}

// 実行
runLocalTest();