#target photoshop

/**
 * 裁片模板导出器 v1
 *
 * 当前版本只处理名为“前片”的图层，输出：
 *   template.json
 *   panels/front.png
 *   masks/front-mask.png
 *
 * 设计约定：
 * 1. template.json 中的 bounds 是裁片在原始 PSD 整张画布中的像素坐标；
 * 2. front.png 的画布尺寸等于裁片 bounds 的宽高；
 * 3. front-mask.png 为白色裁片轮廓，裁片外部透明；
 * 4. 脚本只读取当前文档，不修改原始 PSD；
 * 5. 若 PSD 中存在多个同名“前片”图层，脚本会停止，避免导出错误图层。
 */

(function () {
    var CONFIG = [{
        schemaVersion: 1,
        templateVersion: 1,
        panelId: "back",
        panelName: "后片",
        layerName: "后片",
        fileBaseName: "back"
    },
    {
        schemaVersion: 1,
        templateVersion: 1,
        panelId: "front",
        panelName: "前片",
        layerName: "前片",
        fileBaseName: "front"
    },
    {
        schemaVersion: 1,
        templateVersion: 1,
        panelId: "left-sleeve",
        panelName: "左袖",
        layerName: "左袖",
        fileBaseName: "left-sleeve"
    },
    {
        schemaVersion: 1,
        templateVersion: 1,
        panelId: "right-sleeve",
        panelName: "右袖",
        layerName: "右袖",
        fileBaseName: "right-sleeve"
    },
    {
        schemaVersion: 1,
        templateVersion: 1,
        panelId: "collar",
        panelName: "领条",
        layerName: "领条",
        fileBaseName: "collar"
    }
];

    main();

    function main() {
        if (app.documents.length === 0) {
            alert("没有打开的 Photoshop 文档。\n请先打开生产 PSD，再运行本脚本。");
            return;
        }

        var sourceDoc = app.activeDocument;
        var originalRulerUnits = app.preferences.rulerUnits;
        var originalDialogs = app.displayDialogs;

        try {
            app.preferences.rulerUnits = Units.PIXELS;
            app.displayDialogs = DialogModes.NO;

            var matchedLayers = findLayersByExactName(sourceDoc, CONFIG[0].layerName);

            if (matchedLayers.length === 0) {
                throw new Error(
                    "未找到名为“" + CONFIG[0].layerName + "”的图层。\n" +
                    "请检查 PSD 图层命名是否完全一致。"
                );
            }

            if (matchedLayers.length > 1) {
                throw new Error(
                    "找到 " + matchedLayers.length + " 个名为“" + CONFIG[0].layerName + "”的图层。\n" +
                    "请保证裁片图层名称唯一后再导出。"
                );
            }

            var sourceLayer = matchedLayers[0];
            var panelBounds = readIntegerLayerBounds(sourceLayer);
            validateBounds(panelBounds);

            var outputFolder = Folder.selectDialog(
                "请选择模板输出目录\n脚本将在其中创建 panels、masks 和 template.json"
            );

            if (!outputFolder) {
                return;
            }

            var panelsFolder = ensureChildFolder(outputFolder, "panels");
            var masksFolder = ensureChildFolder(outputFolder, "masks");

            var panelFile = new File(
                panelsFolder.fsName + "/" + CONFIG[0].fileBaseName + ".png"
            );
            var maskFile = new File(
                masksFolder.fsName + "/" + CONFIG[0].fileBaseName + "-mask.png"
            );
            var jsonFile = new File(outputFolder.fsName + "/template.json");

            exportPanelAndMask(
                sourceDoc,
                CONFIG[0].layerName,
                panelBounds,
                panelFile,
                maskFile
            );

            var templateData = buildTemplateData(
                sourceDoc,
                sourceLayer,
                panelBounds
            );

            writeUtf8TextFile(
                jsonFile,
                stringifyJSON(templateData, 2)
            );

            app.activeDocument = sourceDoc;

            alert(
                "裁片模板导出完成。\n\n" +
                "裁片图：" + panelFile.fsName + "\n" +
                "轮廓蒙版：" + maskFile.fsName + "\n" +
                "模板数据：" + jsonFile.fsName + "\n\n" +
                "前片 bounds：\n" +
                "left=" + panelBounds.left + ", top=" + panelBounds.top + "\n" +
                "right=" + panelBounds.right + ", bottom=" + panelBounds.bottom
            );
        } catch (error) {
            try {
                app.activeDocument = sourceDoc;
            } catch (ignoreActiveDocumentError) {}

            alert(
                "裁片模板导出失败：\n\n" +
                getErrorMessage(error)
            );
        } finally {
            app.preferences.rulerUnits = originalRulerUnits;
            app.displayDialogs = originalDialogs;
        }
    }

    /**
     * 在文档中递归查找名称完全一致的图层。
     * ArtLayer 和 LayerSet 都可被找到。
     */
    function findLayersByExactName(container, targetName) {
        var result = [];
        collectLayers(container, targetName, result);
        return result;
    }

    function collectLayers(container, targetName, result) {
        var layers = container.layers;

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];

            if (layer.name === targetName) {
                result.push(layer);
            }

            if (layer.typename === "LayerSet") {
                collectLayers(layer, targetName, result);
            }
        }
    }

    /**
     * 读取图层 bounds，并向外取整。
     * 向外取整可以保证导出的 PNG 不裁掉半透明边缘。
     */
    function readIntegerLayerBounds(layer) {
        var bounds = layer.bounds;

        return {
            left: Math.floor(toPixels(bounds[0])),
            top: Math.floor(toPixels(bounds[1])),
            right: Math.ceil(toPixels(bounds[2])),
            bottom: Math.ceil(toPixels(bounds[3]))
        };
    }

    function toPixels(unitValue) {
        try {
            return Number(unitValue.as("px"));
        } catch (error) {
            return Number(unitValue.value);
        }
    }

    function validateBounds(bounds) {
        if (
            isNaN(bounds.left) ||
            isNaN(bounds.top) ||
            isNaN(bounds.right) ||
            isNaN(bounds.bottom)
        ) {
            throw new Error("无法读取“前片”图层的有效 bounds。");
        }

        if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
            throw new Error(
                "“前片”图层 bounds 无效，图层可能为空或没有可见像素。"
            );
        }
    }

    /**
     * 导出透明裁片 PNG 和白色轮廓蒙版 PNG。
     * 全过程在临时文档中执行，不修改原始 PSD。
     */
    function exportPanelAndMask(
        sourceDoc,
        targetLayerName,
        bounds,
        panelFile,
        maskFile
    ) {
        var panelDoc = null;
        var maskDoc = null;

        try {
            app.activeDocument = sourceDoc;

            panelDoc = sourceDoc.duplicate(
                "__panel_export_" + CONFIG[0].fileBaseName + "__",
                false
            );

            app.activeDocument = panelDoc;

            var tempMatches = findLayersByExactName(panelDoc, targetLayerName);

            if (tempMatches.length !== 1) {
                throw new Error(
                    "临时文档中无法唯一定位“" + targetLayerName + "”图层。"
                );
            }

            var targetLayer = tempMatches[0];

            // 仅保留目标图层所在分支可见，其他图层全部隐藏。
            isolateTargetLayer(panelDoc, targetLayer);

            // 按原始 PSD 中的裁片 bounds 裁切成局部画布。
            panelDoc.crop([
                UnitValue(bounds.left, "px"),
                UnitValue(bounds.top, "px"),
                UnitValue(bounds.right, "px"),
                UnitValue(bounds.bottom, "px")
            ]);

            prepareDocumentForPng(panelDoc);
            exportPng24(panelDoc, panelFile);

            // 蒙版文档从已经裁切好的裁片文档复制，保证尺寸完全一致。
            maskDoc = panelDoc.duplicate(
                "__panel_mask_" + CONFIG[0].fileBaseName + "__",
                false
            );

            app.activeDocument = maskDoc;
            createWhiteSilhouetteMask(maskDoc, CONFIG[0].fileBaseName + "-mask");
            exportPng24(maskDoc, maskFile);
        } finally {
            if (maskDoc) {
                try {
                    maskDoc.close(SaveOptions.DONOTSAVECHANGES);
                } catch (ignoreMaskCloseError) {}
            }

            if (panelDoc) {
                try {
                    panelDoc.close(SaveOptions.DONOTSAVECHANGES);
                } catch (ignorePanelCloseError) {}
            }

            try {
                app.activeDocument = sourceDoc;
            } catch (ignoreSourceActivationError) {}
        }
    }

    /**
     * 隐藏所有与目标图层无关的分支。
     * 若目标本身是图层组，则保留其内部原有可见状态。
     */
    function isolateTargetLayer(container, targetLayer) {
        var layers = container.layers;

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];

            if (layer === targetLayer) {
                layer.visible = true;
                continue;
            }

            if (
                layer.typename === "LayerSet" &&
                layerContainsTarget(layer, targetLayer)
            ) {
                layer.visible = true;
                isolateTargetLayer(layer, targetLayer);
            } else {
                layer.visible = false;
            }
        }
    }

    function layerContainsTarget(layerSet, targetLayer) {
        var layers = layerSet.layers;

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];

            if (layer === targetLayer) {
                return true;
            }

            if (
                layer.typename === "LayerSet" &&
                layerContainsTarget(layer, targetLayer)
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * 将临时文档转换为适合导出 PNG-24 的 RGB / 8 位文档。
     */
    function prepareDocumentForPng(doc) {
        app.activeDocument = doc;

        if (doc.mode !== DocumentMode.RGB) {
            doc.changeMode(ChangeMode.RGB);
        }

        if (doc.bitsPerChannel !== BitsPerChannelType.EIGHT) {
            doc.bitsPerChannel = BitsPerChannelType.EIGHT;
        }
    }

    /**
     * 生成白色轮廓、外部透明的蒙版图。
     */
    function createWhiteSilhouetteMask(doc, maskLayerName) {
        app.activeDocument = doc;

        // 添加透明辅助层，确保即使只有一个可见图层，也能稳定执行“合并可见图层”。
        var mergeHelper = doc.artLayers.add();
        mergeHelper.name = "__transparent_merge_helper__";

        doc.mergeVisibleLayers();

        var mergedPanelLayer = doc.activeLayer;
        selectActiveLayerTransparency();

        var maskLayer = doc.artLayers.add();
        maskLayer.name = maskLayerName;
        doc.activeLayer = maskLayer;

        var white = new SolidColor();
        white.rgb.red = 255;
        white.rgb.green = 255;
        white.rgb.blue = 255;

        doc.selection.fill(
            white,
            ColorBlendMode.NORMAL,
            100,
            false
        );
        doc.selection.deselect();

        mergedPanelLayer.visible = false;
    }

    /**
     * 载入当前活动图层的不透明区域到选区。
     */
    function selectActiveLayerTransparency() {
        var descriptor = new ActionDescriptor();

        var selectionReference = new ActionReference();
        selectionReference.putProperty(
            charIDToTypeID("Chnl"),
            charIDToTypeID("fsel")
        );
        descriptor.putReference(
            charIDToTypeID("null"),
            selectionReference
        );

        var transparencyReference = new ActionReference();
        transparencyReference.putEnumerated(
            charIDToTypeID("Chnl"),
            charIDToTypeID("Chnl"),
            charIDToTypeID("Trsp")
        );
        descriptor.putReference(
            charIDToTypeID("T   "),
            transparencyReference
        );

        executeAction(
            charIDToTypeID("setd"),
            descriptor,
            DialogModes.NO
        );
    }

    /**
     * 通过“存储为 Web 所用格式”导出 24 位透明 PNG。
     */
    function exportPng24(doc, outputFile) {
        app.activeDocument = doc;

        if (outputFile.exists) {
            outputFile.remove();
        }

        var options = new ExportOptionsSaveForWeb();
        options.format = SaveDocumentType.PNG;
        options.PNG8 = false;
        options.transparency = true;
        options.interlaced = false;
        options.includeProfile = false;

        doc.exportDocument(
            outputFile,
            ExportType.SAVEFORWEB,
            options
        );

        if (!outputFile.exists) {
            throw new Error("PNG 导出失败：" + outputFile.fsName);
        }
    }

    function buildTemplateData(sourceDoc, sourceLayer, bounds) {
        var documentWidth = Math.round(toPixels(sourceDoc.width));
        var documentHeight = Math.round(toPixels(sourceDoc.height));
        var panelWidth = bounds.right - bounds.left;
        var panelHeight = bounds.bottom - bounds.top;
        var templateId = removeFileExtension(sourceDoc.name);

        var panelData = {
            panelId: CONFIG[0].panelId,
            name: CONFIG[0].panelName,
            layerName: sourceLayer.name,
            layerPath: getLayerPath(sourceLayer),
            bounds: {
                left: bounds.left,
                top: bounds.top,
                right: bounds.right,
                bottom: bounds.bottom
            },
            size: {
                width: panelWidth,
                height: panelHeight
            },
            center: {
                x: bounds.left + panelWidth / 2,
                y: bounds.top + panelHeight / 2
            },
            panelImage: "panels/" + CONFIG[0].fileBaseName + ".png",
            maskImage: "masks/" + CONFIG[0].fileBaseName + "-mask.png",
            maskMode: "white-on-transparent"
        };

        var panels = {};
        panels[CONFIG[0].panelId] = panelData;

        return {
            schemaVersion: CONFIG[0].schemaVersion,
            templateId: templateId,
            templateVersion: CONFIG[0].templateVersion,
            generatedAt: createIsoDateString(new Date()),
            sourceDocument: {
                fileName: sourceDoc.name,
                width: documentWidth,
                height: documentHeight,
                resolution: Number(sourceDoc.resolution),
                unit: "px",
                colorMode: getDocumentModeName(sourceDoc.mode)
            },
            panelOrder: [CONFIG[0].panelId],
            panels: panels
        };
    }

    function getLayerPath(layer) {
        var names = [layer.name];
        var parent = layer.parent;

        while (parent && parent.typename !== "Document") {
            names.unshift(parent.name);
            parent = parent.parent;
        }

        return names.join("/");
    }

    function getDocumentModeName(mode) {
        if (mode === DocumentMode.RGB) {
            return "RGB";
        }
        if (mode === DocumentMode.CMYK) {
            return "CMYK";
        }
        if (mode === DocumentMode.GRAYSCALE) {
            return "GRAYSCALE";
        }
        if (mode === DocumentMode.LAB) {
            return "LAB";
        }
        if (mode === DocumentMode.BITMAP) {
            return "BITMAP";
        }
        if (mode === DocumentMode.INDEXEDCOLOR) {
            return "INDEXED_COLOR";
        }
        if (mode === DocumentMode.MULTICHANNEL) {
            return "MULTICHANNEL";
        }
        if (mode === DocumentMode.DUOTONE) {
            return "DUOTONE";
        }

        return String(mode);
    }

    function ensureChildFolder(parentFolder, childName) {
        var childFolder = new Folder(parentFolder.fsName + "/" + childName);

        if (!childFolder.exists && !childFolder.create()) {
            throw new Error("无法创建目录：" + childFolder.fsName);
        }

        return childFolder;
    }

    function writeUtf8TextFile(file, text) {
        if (file.exists) {
            file.remove();
        }

        file.encoding = "UTF8";
        file.lineFeed = "Unix";

        if (!file.open("w")) {
            throw new Error("无法写入文件：" + file.fsName);
        }

        try {
            file.write(text);
        } finally {
            file.close();
        }

        if (!file.exists) {
            throw new Error("template.json 写入失败：" + file.fsName);
        }
    }

    function removeFileExtension(fileName) {
        var dotIndex = fileName.lastIndexOf(".");

        if (dotIndex <= 0) {
            return fileName;
        }

        return fileName.substring(0, dotIndex);
    }

    function createIsoDateString(date) {
        return (
            date.getUTCFullYear() + "-" +
            padNumber(date.getUTCMonth() + 1, 2) + "-" +
            padNumber(date.getUTCDate(), 2) + "T" +
            padNumber(date.getUTCHours(), 2) + ":" +
            padNumber(date.getUTCMinutes(), 2) + ":" +
            padNumber(date.getUTCSeconds(), 2) + "Z"
        );
    }

    function padNumber(value, length) {
        var text = String(value);

        while (text.length < length) {
            text = "0" + text;
        }

        return text;
    }

    /**
     * ExtendScript 兼容的 JSON 序列化函数。
     * 避免依赖部分 Photoshop 版本中可能不存在的 JSON.stringify。
     */
    function stringifyJSON(value, indentSize) {
        var indentUnit = repeatText(" ", indentSize || 0);
        return serializeValue(value, indentUnit, "");
    }

    function serializeValue(value, indentUnit, currentIndent) {
        if (value === null) {
            return "null";
        }

        var valueType = typeof value;

        if (valueType === "string") {
            return quoteJSONString(value);
        }

        if (valueType === "number") {
            return isFinite(value) ? String(value) : "null";
        }

        if (valueType === "boolean") {
            return value ? "true" : "false";
        }

        if (isArray(value)) {
            return serializeArray(value, indentUnit, currentIndent);
        }

        if (valueType === "object") {
            return serializeObject(value, indentUnit, currentIndent);
        }

        return "null";
    }

    function serializeArray(arrayValue, indentUnit, currentIndent) {
        if (arrayValue.length === 0) {
            return "[]";
        }

        var childIndent = currentIndent + indentUnit;
        var items = [];

        for (var i = 0; i < arrayValue.length; i++) {
            items.push(
                childIndent + serializeValue(
                    arrayValue[i],
                    indentUnit,
                    childIndent
                )
            );
        }

        return "[\n" + items.join(",\n") + "\n" + currentIndent + "]";
    }

    function serializeObject(objectValue, indentUnit, currentIndent) {
        var childIndent = currentIndent + indentUnit;
        var items = [];

        for (var key in objectValue) {
            if (objectValue.hasOwnProperty(key)) {
                items.push(
                    childIndent +
                    quoteJSONString(key) +
                    ": " +
                    serializeValue(
                        objectValue[key],
                        indentUnit,
                        childIndent
                    )
                );
            }
        }

        if (items.length === 0) {
            return "{}";
        }

        return "{\n" + items.join(",\n") + "\n" + currentIndent + "}";
    }

    function quoteJSONString(text) {
        var result = '"';

        for (var i = 0; i < text.length; i++) {
            var character = text.charAt(i);
            var code = text.charCodeAt(i);

            if (character === '"') {
                result += '\\"';
            } else if (character === "\\") {
                result += "\\\\";
            } else if (character === "\b") {
                result += "\\b";
            } else if (character === "\f") {
                result += "\\f";
            } else if (character === "\n") {
                result += "\\n";
            } else if (character === "\r") {
                result += "\\r";
            } else if (character === "\t") {
                result += "\\t";
            } else if (code < 32) {
                result += "\\u" + padNumber(code.toString(16), 4);
            } else {
                result += character;
            }
        }

        return result + '"';
    }

    function isArray(value) {
        return Object.prototype.toString.call(value) === "[object Array]";
    }

    function repeatText(text, count) {
        var result = "";

        for (var i = 0; i < count; i++) {
            result += text;
        }

        return result;
    }

    function getErrorMessage(error) {
        var message = error && error.message ? error.message : String(error);

        if (error && error.line) {
            message += "\n脚本行号：" + error.line;
        }

        return message;
    }
})();
