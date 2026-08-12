#target photoshop

/**
 * Restore changed order JSON panels into matching PSD smart objects.
 *
 * A panel is restored when its exported status is "completed" or it has
 * elements. The smart object name comes from panels.*.layerName in the order
 * JSON, falling back to panel name and then panel id.
 */
(function () {
    var CONFIG = {
        psdPath: "C:/Users/Woda/Desktop/M-2XL.psd",
        packageFolderPath: "E:/download/design-package-ORDER-20260805-001",
        packageJsonPath: "",
        pickPackageFolder: false,
        jsonShimPath: "S:/JSX/oneChangeToMuch/oneToMuch/JSON.jsx",
        restoreGroupName: "CODEX_ORDER_RESTORE"
    };
    var PANEL_LAYER_NAMES = {
        front: "\u524d\u7247",
        back: "\u540e\u7247",
        collar: "\u9886\u6761",
        "left-sleeve": "\u5de6\u8896",
        "left-sleeve-strip": "\u5de6\u8896\u6761",
        "right-sleeve": "\u53f3\u8896",
        "right-sleeve-strip": "\u53f3\u8896\u6761",
        shouder: "\u80a9\u7247",
        shoulder: "\u80a9\u7247"
    };

    main();

    /**
     * 打开订单 JSON 和目标 PSD，将有改动的裁片还原到对应智能对象。
     * @returns {void}
     */
    function main() {
        var oldUnits = app.preferences.rulerUnits;
        var oldDialogs = app.displayDialogs;

        try {
            app.preferences.rulerUnits = Units.PIXELS;
            app.displayDialogs = DialogModes.NO;

            var orderFile = resolveOrderFile();
            if (!orderFile.exists) {
                throw new Error("Order JSON not found: " + orderFile.fsName);
            }

            var psdFile = new File(CONFIG.psdPath);
            if (!psdFile.exists) {
                throw new Error("PSD not found: " + psdFile.fsName);
            }

            var order = parseJsonFile(orderFile);
            var changedPanels = collectChangedPanels(order);
            if (!changedPanels.length) {
                throw new Error("No changed panels found in order JSON.");
            }

            var mainDoc = openOrActivateDocument(psdFile);
            var restoredPanels = [];
            var missingAssets = [];

            for (var i = 0; i < changedPanels.length; i++) {
                var item = changedPanels[i];
                var smartObjectNames = panelSmartObjectNames(item.panelId, item.panel);
                var smartLayer = findFirstSmartObjectLayer(mainDoc, smartObjectNames);

                if (!smartLayer) {
                    throw new Error(
                        "Smart object not found for panel " + item.panelId + ": " + smartObjectNames.join(", ") +
                        "\nAvailable smart objects:\n" + collectSmartObjectLayerNames(mainDoc).join("\n")
                    );
                }

                app.activeDocument = mainDoc;
                mainDoc.activeLayer = smartLayer;
                editSmartObjectContents();

                var smartDoc = app.activeDocument;
                var panelMissingAssets = restorePanelElements(smartDoc, order, item.panel, orderFile.parent);
                missingAssets = missingAssets.concat(prefixItems(panelMissingAssets, item.panelId + ": "));
                smartDoc.save();
                smartDoc.close(SaveOptions.SAVECHANGES);

                app.activeDocument = mainDoc;
                restoredPanels.push(item.panelId);
            }

            mainDoc.save();

            var message = "Restored panels: " + restoredPanels.join(", ") + "\nPSD: " + psdFile.fsName;
            if (missingAssets.length) {
                message += "\n\nMissing image assets skipped:\n" + unique(missingAssets).join("\n");
            }
            alert(message);
        } catch (error) {
            alert("Panel smart object restore failed:\n\n" + getErrorMessage(error));
        } finally {
            app.preferences.rulerUnits = oldUnits;
            app.displayDialogs = oldDialogs;
        }
    }

    /**
     * 从订单 JSON 中收集需要还原的裁片。
     * @param {Object} order 订单 JSON 对象
     * @returns {Object[]} 裁片列表，每项包含 panelId 和 panel
     */
    function collectChangedPanels(order) {
        var result = [];
        if (!order || !order.panels) {
            return result;
        }

        var panelIds = order.panelOrder || objectKeys(order.panels);
        for (var i = 0; i < panelIds.length; i++) {
            var panelId = panelIds[i];
            var panel = order.panels[panelId];
            if (!panel || !panel.elements) {
                continue;
            }

            if (panel.changed === true || panel.status === "completed" || panel.elements.length > 0) {
                result.push({ panelId: panelId, panel: panel });
            }
        }

        return result;
    }

    /**
     * 生成某个裁片可匹配的智能对象图层名称列表。
     * @param {String} panelId 裁片 ID
     * @param {Object} panel 裁片数据
     * @returns {String[]} 去重后的候选图层名称
     */
    function panelSmartObjectNames(panelId, panel) {
        return unique([
            panel.layerName,
            panel.name,
            PANEL_LAYER_NAMES[panelId],
            panelId
        ]);
    }

    /**
     * 按 zIndex 顺序把面板元素还原到智能对象文档中。
     * @param {Document} doc 智能对象内部文档
     * @param {Object} order 订单 JSON 对象
     * @param {Object} panel 当前面板数据
     * @param {Folder} jsonFolder 订单 JSON 所在目录
     * @returns {String[]} 未找到的素材名称列表
     */
    function restorePanelElements(doc, order, panel, jsonFolder) {
        app.activeDocument = doc;

        removeLayerSetByName(doc, CONFIG.restoreGroupName);

        var group = doc.layerSets.add();
        group.name = CONFIG.restoreGroupName;

        var elements = panel.elements.slice(0).sort(function (a, b) {
            return Number(a.zIndex || 0) - Number(b.zIndex || 0);
        });

        var missingAssets = [];

        for (var i = 0; i < elements.length; i++) {
            var element = elements[i];
            if (element.visible === false) {
                continue;
            }

            if (element.type === "text") {
                createTextLayer(doc, group, element);
            } else if (element.type === "image") {
                var asset = findAsset(order.assets || [], element.assetId);
                var assetFile = asset ? resolveAssetFile(jsonFolder, asset.sourceFile) : null;
                if (assetFile && assetFile.exists) {
                    createImageLayer(doc, group, element, assetFile);
                } else {
                    missingAssets.push(asset ? asset.sourceFile : element.assetId);
                }
            }
        }

        return missingAssets;
    }

    /**
     * 根据订单文字元素创建 Photoshop 文字图层。
     * @param {Document} doc 目标文档
     * @param {LayerSet} group 承载还原图层的图层组
     * @param {Object} element 订单中的文字元素
     * @returns {void}
     */
    function createTextLayer(doc, group, element) {
        app.activeDocument = doc;

        var target = elementTargetRect(doc, element.rasterTarget || element);
        var layer = doc.artLayers.add();
        layer.kind = LayerKind.TEXT;
        layer.name = "text " + String(element.text || "");

        var text = layer.textItem;
        text.contents = String(element.text || "");
        text.size = UnitValue(200, "px");
        text.position = [UnitValue(target.centerX, "px"), UnitValue(target.centerY, "px")];
        text.justification = Justification.CENTER;

        try {
            text.font = element.photoshopFont || "Arial-BoldMT";
        } catch (ignoreFontError) {}

        text.color = solidColorFromHex(element.fill || "#000000");
        layer.opacity = percent(element.opacity == null ? 1 : element.opacity);

        fitLayerToRect(layer, target);

        if (element.rotation) {
            layer.rotate(Number(element.rotation), AnchorPosition.MIDDLECENTER);
        }

        applyStroke(layer, element.stroke || "#000000", Math.max(1, toPixels(doc.width) * Number(element.strokeWidth || 0.01)));
        moveIntoGroup(layer, group);
    }

    /**
     * 打开图片素材并复制为目标文档中的图像图层。
     * @param {Document} doc 目标文档
     * @param {LayerSet} group 承载还原图层的图层组
     * @param {Object} element 订单中的图片元素
     * @param {File} assetFile 已解析到的图片素材文件
     * @returns {void}
     */
    function createImageLayer(doc, group, element, assetFile) {
        var imageDoc = null;
        app.activeDocument = doc;

        try {
            imageDoc = app.open(assetFile);
            imageDoc.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
        } finally {
            if (imageDoc) {
                imageDoc.close(SaveOptions.DONOTSAVECHANGES);
            }
        }

        app.activeDocument = doc;
        var layer = doc.activeLayer;
        layer.name = "image asset " + assetFile.name;
        layer.opacity = percent(element.opacity == null ? 1 : element.opacity);

        fitLayerToRect(layer, elementTargetRect(doc, element));

        if (element.rotation) {
            layer.rotate(Number(element.rotation), AnchorPosition.MIDDLECENTER);
        }

        moveIntoGroup(layer, group);
    }

    /**
     * 将订单中的相对坐标换算为文档像素坐标矩形。
     * @param {Document} doc 目标文档
     * @param {Object} element 订单元素，包含 centerX、centerY、width、height
     * @returns {Object} 像素矩形 {left, top, right, bottom, width, height, centerX, centerY}
     */
    function elementTargetRect(doc, element) {
        var docWidth = toPixels(doc.width);
        var docHeight = toPixels(doc.height);
        var width = Number(element.width || 0) * docWidth;
        var height = Number(element.height || 0) * docHeight;
        var centerX = Number(element.centerX || 0) * docWidth;
        var centerY = Number(element.centerY || 0) * docHeight;

        return {
            width: width,
            height: height,
            centerX: centerX,
            centerY: centerY,
            left: centerX - width / 2,
            top: centerY - height / 2,
            right: centerX + width / 2,
            bottom: centerY + height / 2
        };
    }

    /**
     * 将图层缩放并移动到目标矩形。
     * @param {ArtLayer|LayerSet} layer 需要调整的图层或图层组
     * @param {Object} target 目标像素矩形
     * @returns {void}
     */
    function fitLayerToRect(layer, target) {
        var bounds = readBounds(layer);
        var currentWidth = bounds.right - bounds.left;
        var currentHeight = bounds.bottom - bounds.top;

        if (currentWidth <= 0 || currentHeight <= 0) {
            throw new Error("Invalid layer bounds: " + layer.name);
        }

        layer.resize(
            (target.width / currentWidth) * 100,
            (target.height / currentHeight) * 100,
            AnchorPosition.MIDDLECENTER
        );

        bounds = readBounds(layer);
        var layerCenterX = (bounds.left + bounds.right) / 2;
        var layerCenterY = (bounds.top + bounds.bottom) / 2;
        layer.translate(
            UnitValue(target.centerX - layerCenterX, "px"),
            UnitValue(target.centerY - layerCenterY, "px")
        );
    }

    /**
     * 在文档或图层组中递归查找指定名称的智能对象图层。
     * @param {Document|LayerSet} container 搜索容器
     * @param {String} name 智能对象图层名称
     * @returns {ArtLayer|null} 匹配的智能对象图层
     */
    function findSmartObjectLayer(container, name) {
        var layers = container.layers;

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.name === name && layer.typename === "ArtLayer" && layer.kind === LayerKind.SMARTOBJECT) {
                return layer;
            }
            if (layer.typename === "LayerSet") {
                var found = findSmartObjectLayer(layer, name);
                if (found) {
                    return found;
                }
            }
        }

        return null;
    }

    /**
     * 按候选名称顺序查找第一个存在的智能对象图层。
     * @param {Document|LayerSet} container 搜索容器
     * @param {String[]} names 候选智能对象名称
     * @returns {ArtLayer|null} 第一个匹配的智能对象图层
     */
    function findFirstSmartObjectLayer(container, names) {
        for (var i = 0; i < names.length; i++) {
            var layer = findSmartObjectLayer(container, names[i]);
            if (layer) {
                return layer;
            }
        }

        return null;
    }

    /**
     * 递归收集文档或图层组中的智能对象图层名称。
     * @param {Document|LayerSet} container 搜索容器
     * @returns {String[]} 智能对象图层名称列表
     */
    function collectSmartObjectLayerNames(container) {
        var result = [];
        var layers = container.layers;

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.typename === "ArtLayer" && layer.kind === LayerKind.SMARTOBJECT) {
                result.push(layer.name);
            }
            if (layer.typename === "LayerSet") {
                result = result.concat(collectSmartObjectLayerNames(layer));
            }
        }

        return result;
    }

    /**
     * 打开当前活动智能对象图层的内容文档。
     * @returns {void}
     */
    function editSmartObjectContents() {
        executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);
    }

    /**
     * 如果 PSD 已经打开则激活它，否则从磁盘打开。
     * @param {File} file PSD 文件
     * @returns {Document} 已激活的 Photoshop 文档
     */
    function openOrActivateDocument(file) {
        for (var i = 0; i < app.documents.length; i++) {
            var doc = app.documents[i];
            try {
                if (doc.fullName.fsName === file.fsName) {
                    app.activeDocument = doc;
                    return doc;
                }
            } catch (ignoreUnsavedDoc) {}
        }

        return app.open(file);
    }

    /**
     * 读取并解析 UTF-8 JSON 文件。
     * @param {File} file JSON 文件
     * @returns {Object} 解析后的 JSON 对象
     */
    function parseJsonFile(file) {
        ensureJsonSupport();

        file.encoding = "UTF8";
        if (!file.open("r")) {
            throw new Error("Unable to read JSON: " + file.fsName);
        }

        var text;
        try {
            text = file.read();
        } finally {
            file.close();
        }

        if (typeof JSON !== "undefined" && JSON.parse) {
            return JSON.parse(text);
        }

        return eval("(" + text + ")");
    }

    /**
     * 在旧版 ExtendScript 没有 JSON 对象时加载 JSON shim。
     * @returns {void}
     */
    function ensureJsonSupport() {
        if (typeof JSON !== "undefined" && JSON.parse) {
            return;
        }

        var shim = new File(CONFIG.jsonShimPath);
        if (shim.exists) {
            $.evalFile(shim);
        }
    }

    /**
     * 按运行时变量、选择目录、配置路径顺序解析订单 JSON。
     * @returns {File} 订单 JSON 文件
     */
    function resolveOrderFile() {
        var runtimeFolderPath = runtimePackageFolder();
        if (runtimeFolderPath) {
            return orderFileInFolder(runtimeFolderPath);
        }

        if (CONFIG.pickPackageFolder) {
            var selectedFolder = Folder.selectDialog("Select the extracted design package folder");
            if (selectedFolder) {
                return orderFileInFolder(selectedFolder.fsName);
            }
        }

        if (CONFIG.packageJsonPath) {
            return new File(CONFIG.packageJsonPath);
        }

        return orderFileInFolder(CONFIG.packageFolderPath);
    }

    /**
     * 在设计包目录中优先查找 manifest.json，其次查找 order-design.json。
     * @param {String} folderPath 设计包目录路径
     * @returns {File} 找到的订单文件，或默认候选文件
     */
    function orderFileInFolder(folderPath) {
        if (!folderPath) {
            return new File("");
        }

        return firstExistingFile([
            folderPath + "/manifest.json",
            folderPath + "/order-design.json"
        ]);
    }

    /**
     * 读取 PowerShell runner 注入的设计包目录。
     * @returns {String} 设计包目录路径，未注入时为空字符串
     */
    function runtimePackageFolder() {
        try {
            return $.global.CODEX_PACKAGE_FOLDER || "";
        } catch (ignoreRuntimeFolder) {
            return "";
        }
    }

    /**
     * 返回路径列表中第一个存在的文件。
     * @param {String[]} paths 候选文件路径
     * @returns {File} 第一个存在的文件，或首个候选路径对应的文件
     */
    function firstExistingFile(paths) {
        for (var i = 0; i < paths.length; i++) {
            var file = new File(paths[i]);
            if (file.exists) {
                return file;
            }
        }

        return new File(paths[0]);
    }

    /**
     * 从设计包目录和常用下载目录中解析素材文件。
     * @param {Folder} jsonFolder 订单 JSON 所在目录
     * @param {String} sourceFile 素材文件名
     * @returns {File|null} 找到的素材文件
     */
    function resolveAssetFile(jsonFolder, sourceFile) {
        if (!sourceFile) {
            return null;
        }

        var candidates = [
            new File(jsonFolder.fsName + "/assets/" + sourceFile),
            new File(jsonFolder.fsName + "/" + sourceFile),
            new File("E:/download/assets/" + sourceFile),
            new File("E:/download/" + sourceFile),
            new File("C:/Users/Woda/Downloads/" + sourceFile),
            new File("C:/Users/Woda/Desktop/" + sourceFile)
        ];

        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].exists) {
                return candidates[i];
            }
        }

        return null;
    }

    /**
     * 根据 assetId 在订单素材列表中查找素材记录。
     * @param {Object[]} assets 订单素材列表
     * @param {String} assetId 素材 ID
     * @returns {Object|null} 匹配的素材记录
     */
    function findAsset(assets, assetId) {
        for (var i = 0; i < assets.length; i++) {
            if (assets[i].assetId === assetId) {
                return assets[i];
            }
        }

        return null;
    }

    /**
     * 删除文档根级指定名称的图层组。
     * @param {Document} doc 目标文档
     * @param {String} name 图层组名称
     * @returns {void}
     */
    function removeLayerSetByName(doc, name) {
        for (var i = doc.layerSets.length - 1; i >= 0; i--) {
            if (doc.layerSets[i].name === name) {
                doc.layerSets[i].remove();
            }
        }
    }

    /**
     * 将图层移入指定图层组，忽略 Photoshop 偶发移动失败。
     * @param {ArtLayer|LayerSet} layer 需要移动的图层
     * @param {LayerSet} group 目标图层组
     * @returns {void}
     */
    function moveIntoGroup(layer, group) {
        try {
            layer.move(group, ElementPlacement.INSIDE);
        } catch (ignoreMoveError) {}
    }

    /**
     * 读取 Photoshop 图层 bounds 并转换为像素数字。
     * @param {ArtLayer|LayerSet} layer Photoshop 图层或图层组
     * @returns {Object} 像素边界 {left, top, right, bottom}
     */
    function readBounds(layer) {
        var b = layer.bounds;
        return {
            left: toPixels(b[0]),
            top: toPixels(b[1]),
            right: toPixels(b[2]),
            bottom: toPixels(b[3])
        };
    }

    /**
     * 将 Photoshop UnitValue 转换为像素数字。
     * @param {UnitValue|Object|Number} value Photoshop 单位值
     * @returns {Number} 像素值
     */
    function toPixels(value) {
        try {
            return Number(value.as("px"));
        } catch (error) {
            return Number(value.value);
        }
    }

    /**
     * 将 0-1 小数透明度转换为 Photoshop 使用的 0-100 百分比。
     * @param {Number} value 小数值
     * @returns {Number} 限制在 0-100 的百分比
     */
    function percent(value) {
        return Math.max(0, Math.min(100, Number(value) * 100));
    }

    /**
     * 将十六进制颜色转换为 Photoshop SolidColor。
     * @param {String} hex 十六进制颜色，如 #000000 或 #000
     * @returns {SolidColor} Photoshop 颜色对象
     */
    function solidColorFromHex(hex) {
        var text = String(hex || "#000000").replace("#", "");
        if (text.length === 3) {
            text = text.charAt(0) + text.charAt(0) + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2);
        }

        var color = new SolidColor();
        color.rgb.red = parseInt(text.substring(0, 2), 16);
        color.rgb.green = parseInt(text.substring(2, 4), 16);
        color.rgb.blue = parseInt(text.substring(4, 6), 16);
        return color;
    }

    /**
     * 给图层应用外描边图层样式。
     * @param {ArtLayer} layer 目标图层
     * @param {String} hex 描边颜色
     * @param {Number} sizePx 描边宽度，单位像素
     * @returns {void}
     */
    function applyStroke(layer, hex, sizePx) {
        app.activeDocument.activeLayer = layer;

        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("Lefx"));
        ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);

        var effects = new ActionDescriptor();
        effects.putUnitDouble(charIDToTypeID("Scl "), charIDToTypeID("#Prc"), 100);

        var stroke = new ActionDescriptor();
        stroke.putBoolean(charIDToTypeID("enab"), true);
        stroke.putEnumerated(charIDToTypeID("Styl"), charIDToTypeID("FStl"), charIDToTypeID("OutF"));
        stroke.putEnumerated(charIDToTypeID("PntT"), charIDToTypeID("FrFl"), charIDToTypeID("SClr"));
        stroke.putEnumerated(charIDToTypeID("Md  "), charIDToTypeID("BlnM"), charIDToTypeID("Nrml"));
        stroke.putUnitDouble(charIDToTypeID("Opct"), charIDToTypeID("#Prc"), 100);
        stroke.putUnitDouble(charIDToTypeID("Sz  "), charIDToTypeID("#Pxl"), sizePx);

        var color = solidColorFromHex(hex);
        var colorDesc = new ActionDescriptor();
        colorDesc.putDouble(charIDToTypeID("Rd  "), color.rgb.red);
        colorDesc.putDouble(charIDToTypeID("Grn "), color.rgb.green);
        colorDesc.putDouble(charIDToTypeID("Bl  "), color.rgb.blue);
        stroke.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), colorDesc);

        effects.putObject(charIDToTypeID("FrFX"), charIDToTypeID("FrFX"), stroke);
        desc.putObject(charIDToTypeID("T   "), charIDToTypeID("Lefx"), effects);
        executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
    }

    /**
     * 返回对象自身可枚举键名，兼容旧版 ExtendScript。
     * @param {Object} object 源对象
     * @returns {String[]} 键名列表
     */
    function objectKeys(object) {
        var result = [];
        for (var key in object) {
            if (object.hasOwnProperty(key)) {
                result.push(key);
            }
        }
        return result;
    }

    /**
     * 给列表每一项添加统一前缀。
     * @param {Array} items 原始列表
     * @param {String} prefix 前缀文本
     * @returns {Array} 添加前缀后的列表
     */
    function prefixItems(items, prefix) {
        var result = [];
        for (var i = 0; i < items.length; i++) {
            result.push(prefix + items[i]);
        }
        return result;
    }

    /**
     * 返回去重后的非空字符串数组。
     * @param {Array} items 原始列表
     * @returns {Array} 去重后的列表
     */
    function unique(items) {
        var result = [];
        for (var i = 0; i < items.length; i++) {
            if (items[i] && result.join("\n").indexOf(items[i]) === -1) {
                result.push(items[i]);
            }
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
            message += "\nScript line: " + error.line;
        }
        return message;
    }
})();
