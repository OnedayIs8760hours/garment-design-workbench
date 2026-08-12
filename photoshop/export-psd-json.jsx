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

    /**
     * 从当前 PSD 导出裁片 PNG、遮罩 PNG 和 template.json。
     * @returns {void}
     */
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
     * 在文档或图层组中查找名称完全一致的图层。
     * @param {Document|LayerSet} container 搜索容器
     * @param {String} targetName 目标图层名称
     * @returns {Array} 匹配的图层列表
     */
    function findLayersByExactName(container, targetName) {
        var result = [];
        collectLayers(container, targetName, result);
        return result;
    }

    /**
     * 递归收集指定名称的图层。
     * @param {Document|LayerSet} container 搜索容器
     * @param {String} targetName 目标图层名称
     * @param {Array} result 收集结果数组
     * @returns {void}
     */
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
     * 读取图层 bounds 并向外取整为整数像素。
     * @param {ArtLayer|LayerSet} layer Photoshop 图层或图层组
     * @returns {Object} 整数像素边界 {left, top, right, bottom}
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

    /**
     * 将 Photoshop UnitValue 转换为像素数字。
     * @param {UnitValue|Object|Number} unitValue Photoshop 单位值
     * @returns {Number} 像素值
     */
    function toPixels(unitValue) {
        try {
            return Number(unitValue.as("px"));
        } catch (error) {
            return Number(unitValue.value);
        }
    }

    /**
     * 校验图层 bounds 是否为有效矩形。
     * @param {Object} bounds 图层边界 {left, top, right, bottom}
     * @returns {void}
     */
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
     * 导出透明裁片 PNG 和白色轮廓遮罩 PNG。
     * @param {Document} sourceDoc 源 PSD 文档
     * @param {String} targetLayerName 目标裁片图层名称
     * @param {Object} bounds 裁片像素边界
     * @param {File} panelFile 裁片 PNG 输出文件
     * @param {File} maskFile 遮罩 PNG 输出文件
     * @returns {void}
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
     * @param {Document|LayerSet} container 需要处理的文档或图层组
     * @param {ArtLayer|LayerSet} targetLayer 需要保留可见的目标图层
     * @returns {void}
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

    /**
     * 判断图层组内部是否包含目标图层。
     * @param {LayerSet} layerSet 待检查的图层组
     * @param {ArtLayer|LayerSet} targetLayer 目标图层
     * @returns {Boolean} 包含目标图层时返回 true
     */
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
     * @param {Document} doc 需要准备的临时文档
     * @returns {void}
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
     * 生成白色轮廓、外部透明的遮罩图。
     * @param {Document} doc 裁剪后的临时文档
     * @param {String} maskLayerName 遮罩图层名称
     * @returns {void}
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
     * @returns {void}
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
     * @param {Document} doc 需要导出的文档
     * @param {File} outputFile PNG 输出文件
     * @returns {void}
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

    /**
     * 根据源文档和裁片 bounds 生成 template.json 数据结构。
     * @param {Document} sourceDoc 源 PSD 文档
     * @param {ArtLayer|LayerSet} sourceLayer 源裁片图层
     * @param {Object} bounds 裁片像素边界
     * @returns {Object} template.json 数据对象
     */
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

    /**
     * 读取图层在 PSD 图层树中的路径。
     * @param {ArtLayer|LayerSet} layer Photoshop 图层或图层组
     * @returns {String} 以 / 分隔的图层路径
     */
    function getLayerPath(layer) {
        var names = [layer.name];
        var parent = layer.parent;

        while (parent && parent.typename !== "Document") {
            names.unshift(parent.name);
            parent = parent.parent;
        }

        return names.join("/");
    }

    /**
     * 将 Photoshop 文档颜色模式枚举转换为可读文本。
     * @param {DocumentMode} mode Photoshop 文档模式
     * @returns {String} 文档模式名称
     */
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

    /**
     * 确保父目录下存在指定子目录。
     * @param {Folder} parentFolder 父目录
     * @param {String} childName 子目录名
     * @returns {Folder} 子目录对象
     */
    function ensureChildFolder(parentFolder, childName) {
        var childFolder = new Folder(parentFolder.fsName + "/" + childName);

        if (!childFolder.exists && !childFolder.create()) {
            throw new Error("无法创建目录：" + childFolder.fsName);
        }

        return childFolder;
    }

    /**
     * 以 UTF-8 写入文本文件，存在时先覆盖。
     * @param {File} file 输出文件
     * @param {String} text 文件内容
     * @returns {void}
     */
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

    /**
     * 移除文件名最后一个扩展名。
     * @param {String} fileName 文件名
     * @returns {String} 不含扩展名的文件名
     */
    function removeFileExtension(fileName) {
        var dotIndex = fileName.lastIndexOf(".");

        if (dotIndex <= 0) {
            return fileName;
        }

        return fileName.substring(0, dotIndex);
    }

    /**
     * 创建 UTC ISO 时间字符串，兼容旧版 ExtendScript。
     * @param {Date} date 日期对象
     * @returns {String} ISO 时间字符串
     */
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

    /**
     * 将数字左侧补零到指定长度。
     * @param {Number|String} value 数字或文本
     * @param {Number} length 目标长度
     * @returns {String} 补零后的文本
     */
    function padNumber(value, length) {
        var text = String(value);

        while (text.length < length) {
            text = "0" + text;
        }

        return text;
    }

    /**
     * 序列化 JSON 值，兼容旧版 ExtendScript。
     * @param {*} value 需要序列化的值
     * @param {Number} indentSize 缩进空格数量
     * @returns {String} JSON 文本
     */
    function stringifyJSON(value, indentSize) {
        var indentUnit = repeatText(" ", indentSize || 0);
        return serializeValue(value, indentUnit, "");
    }

    /**
     * 序列化任意 JSON 值。
     * @param {*} value 需要序列化的值
     * @param {String} indentUnit 单级缩进文本
     * @param {String} currentIndent 当前缩进文本
     * @returns {String} JSON 片段
     */
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

    /**
     * 序列化 JSON 数组。
     * @param {Array} arrayValue 数组值
     * @param {String} indentUnit 单级缩进文本
     * @param {String} currentIndent 当前缩进文本
     * @returns {String} JSON 数组片段
     */
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

    /**
     * 序列化 JSON 对象。
     * @param {Object} objectValue 对象值
     * @param {String} indentUnit 单级缩进文本
     * @param {String} currentIndent 当前缩进文本
     * @returns {String} JSON 对象片段
     */
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

    /**
     * 将文本转义为 JSON 字符串字面量。
     * @param {String} text 原始文本
     * @returns {String} 带双引号的 JSON 字符串
     */
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

    /**
     * 判断值是否为数组，兼容旧版 ExtendScript。
     * @param {*} value 待检查的值
     * @returns {Boolean} 是数组时返回 true
     */
    function isArray(value) {
        return Object.prototype.toString.call(value) === "[object Array]";
    }

    /**
     * 重复拼接文本。
     * @param {String} text 要重复的文本
     * @param {Number} count 重复次数
     * @returns {String} 拼接后的文本
     */
    function repeatText(text, count) {
        var result = "";

        for (var i = 0; i < count; i++) {
            result += text;
        }

        return result;
    }

    /**
     * 将异常对象格式化为带脚本行号的提示文本。
     * @param {Error|Object|String} error 异常对象或文本
     * @returns {String} 错误提示文本
     */
    function getErrorMessage(error) {
        var message = error && error.message ? error.message : String(error);

        if (error && error.line) {
            message += "\n脚本行号：" + error.line;
        }

        return message;
    }
})();
