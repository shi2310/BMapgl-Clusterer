import _ from 'lodash';

/**
 * 获取一个扩展的视图范围，把上下左右都扩大一样的像素值。
 * @param {*} map BMap.Map的实例化对象
 * @param {*} bounds BMap.Bounds的实例化对象
 * @param {*} gridSize 要扩大的像素值
 * @returns
 */
const getExtendedBounds = function (map, bounds, gridSize) {
  bounds = cutBoundsInRange(bounds);
  const pixelNE = map.pointToPixel(bounds.getNorthEast());
  const pixelSW = map.pointToPixel(bounds.getSouthWest());
  pixelNE.x += gridSize;
  pixelNE.y -= gridSize;
  pixelSW.x -= gridSize;
  pixelSW.y += gridSize;
  const newNE = map.pixelToPoint(pixelNE);
  const newSW = map.pixelToPoint(pixelSW);
  return new BMapGL.Bounds(newSW, newNE);
};
/**
 * 按照百度地图支持的世界范围对bounds进行边界处理
 * @param {*} bounds BMap.Bounds的实例化对象
 * @returns 返回不越界的视图范围
 */
const cutBoundsInRange = function (bounds) {
  const maxX = _.clamp(bounds.getNorthEast().lng, -180, 180);
  const minX = _.clamp(bounds.getSouthWest().lng, -180, 180);
  const maxY = _.clamp(bounds.getNorthEast().lat, -74, 74);
  const minY = _.clamp(bounds.getSouthWest().lat, -74, 74);
  return new BMapGL.Bounds(new BMapGL.Point(minX, minY), new BMapGL.Point(maxX, maxY));
};

/**
 * 聚合集
 */
class MarkerClusterer {
  /**
   * MarkerClusterer
   * 用来解决加载大量点要素到地图上产生覆盖现象的问题，并提高性能
   * @param {map} map 地图的一个实例。
   * @param {options} options 可选参数，可选项包括：<br />
   * gridSize {Number} 聚合计算时网格的像素大小，默认60<br />
   * onClustersChange {func} 聚合对象集变化的回调<br />
   */
  constructor(map, { gridSize, onClustersChange }) {
    if (!map) {
      return;
    }
    this._map = map;
    // 原始点集合
    this._orginMarkers = [];
    // 聚合集
    this._clusters = [];
    this._gridSize = gridSize || 60;
    this._onClustersChange = onClustersChange;
    this._map.addEventListener('zoomend', this._redraw);
    this._map.addEventListener('moveend', this._redraw);
  }

  /**
   * 添加一组聚合的标记
   * @param {MyMarker[]} markers
   */
  addMarkers = (markers) => {
    _.each(markers, (marker) => {
      if (!_.some(this._orginMarkers, { key: marker.key })) {
        this._orginMarkers.push(marker);
      }
    });
    this._computeClusters();
  };

  /**
   * 根据所给定的标记计算聚合
   */
  _computeClusters = () => {
    // 获取地图边界
    const mapBounds = this._map.getBounds();
    // 扩展视图边界
    const extendedBounds = getExtendedBounds(this._map, mapBounds, this._gridSize);
    // 遍历所有的点并判断是否需要聚合
    _.each(this._orginMarkers, (marker) => {
      //在视图扩展边界之内
      if (extendedBounds.containsPoint(marker.getPosition())) {
        let distance = Infinity; // 无限大
        let matchCluster = null; // 最匹配的聚合对象
        // 查找跟当前marker最匹配的聚合对象
        _.each(this._clusters, (cluster) => {
          // 在聚合对象网格范围内查找最近的聚合对象
          if (cluster.isMarkerInClusterBounds(marker)) {
            // 获取marker与聚合对象中心的距离，单位米
            const d = this._map.getDistance(cluster.getCenter(), marker.getPosition());
            // 按照距离最近的聚合对象进行匹配
            if (d < distance) {
              distance = d;
              matchCluster = cluster;
            }
          }
        });
        // 当前marker是否有适配的聚合对象
        if (matchCluster) {
          matchCluster.pushMarker(marker);
        } else {
          // 无匹配聚合对象则新建聚合对象
          const cluster = new Cluster(this, '聚合' + this._clusters.length);
          cluster.pushMarker(marker);
          this._clusters.push(cluster);
        }
      }
    });
    // 改变后的聚合对象返回
    this._onClustersChange && this._onClustersChange(this._clusters);
  };

  /**
   * 清除所有聚合对象
   */
  _clearAllClusters = () => {
    _.each(this._clusters, (cluster) => {
      // 聚合对象清除内部
      cluster.remove();
    });
    // 清除所有聚合对象
    this._clusters.length = 0;
  };

  /**
   * 销毁
   */
  dispose = () => {
    this._clearAllClusters();
    this._orginMarkers.length = 0;
    this._clusters.length = 0;
    this._map.removeEventListener('zoomend', this._redraw);
    this._map.removeEventListener('moveend', this._redraw);
    this._map = null;
  };

  /**
   * 重绘
   */
  _redraw = () => {
    // 清除聚合
    this._clearAllClusters();
    // 计算聚合
    this._computeClusters();
  };

  getGridSize = () => {
    return this._gridSize;
  };

  getMap = () => {
    return this._map;
  };
}

/**
 * 聚合对象
 */
class Cluster {
  // 网格边界
  _gridBounds = null;
  // 聚合对象中心
  _center = null;
  // 聚合对象中marker集合
  _markers = [];
  // 聚合对象名称
  _name = null;
  // 中心指示线
  _lines = [];

  constructor(markerClusterer, name) {
    this._name = name;
    this._markerClusterer = markerClusterer;
    this._map = markerClusterer.getMap();
  }

  /**
   * marker加入本聚合
   * @param {MyMarker} marker
   * @returns
   */
  pushMarker = (marker) => {
    if (this.isMarkerInCluster(marker)) {
      return false;
    }

    // 加入marker集合
    this._markers.push(marker);
    // 加入marker后重新计算中心点
    if (!this._center) {
      this._center = marker.getPosition();
    } else {
      const l = this._markers.length + 1;
      const lat = (this._center.lat * (l - 1) + marker.getPosition().lat) / l;
      const lng = (this._center.lng * (l - 1) + marker.getPosition().lng) / l;
      this._center = new BMapGL.Point(lng, lat);
    }
    // 更新边界
    this.updateGridBounds();

    const len = this._markers.length;
    // 小于2不成聚合
    if (len >= 2) {
      // 重新按圆形分配位置
      const radian = 360 / len; // 等分圆形的弧度
      const radiu = this._markerClusterer.getGridSize(); // 像素半径
      this._lines.length = 0;
      _.each(this._markers, (marker, i) => {
        const currentRadian = (radian * i * Math.PI) / 180;
        // 转为像素
        const xy = this._map.pointToPixel(this._center);
        const newXY = {
          x: xy.x + radiu * Math.cos(currentRadian),
          y: xy.y - radiu * Math.sin(currentRadian),
        };

        const newPos = this._map.pixelToPoint(newXY);
        marker.setPosition(newPos);

        // 指示线
        this._lines.push([this._center, newPos]);
      });
    } else {
      // 清除位置偏移
      marker.setPosition(null);
    }
  };

  /**
   * 是否已参与本聚合
   * @param {MyMarker} marker
   * @returns
   */
  isMarkerInCluster = (marker) => {
    if (this._markers.indexOf) {
      return this._markers.indexOf(marker) != -1;
    } else {
      for (let i = 0, m; (m = this._markers[i]); i++) {
        if (m === marker) {
          return true;
        }
      }
    }
    return false;
  };

  /**
   * 是否在本聚合网格范围中
   * @param {MyMarker} marker
   * @returns
   */
  isMarkerInClusterBounds = (marker) => {
    return this._gridBounds.containsPoint(marker.getPosition());
  };

  /**
   * 更新本聚合的网格范围
   */
  updateGridBounds = () => {
    const bounds = new BMapGL.Bounds(this._center, this._center);
    this._gridBounds = getExtendedBounds(this._map, bounds, this._markerClusterer.getGridSize());
  };

  /**
   * 清除本聚合所有元素
   */
  remove = () => {
    this._gridBounds = null;
    this._center = null;
    this._name = null;
    this._markers.length = 0;
    this._lines.length = 0;
    this._map = null;
    this._markerClusterer = null;
  };

  /**
   * 获取本聚合对象边界
   * @returns
   */
  getBounds = () => {
    const bounds = new BMapGL.Bounds(this._center, this._center);
    _.each(this._markers, (marker) => {
      bounds.extend(marker.getPosition());
    });
    return bounds;
  };

  /**
   * 获取本聚合对象中心
   * @returns
   */
  getCenter = () => {
    return this._center;
  };

  get isReal() {
    return this._markers.length > 1;
  }
}

/**
 * 标记对象
 */
class MyMarker {
  // 原始位置
  originPosition = null;
  // 新位置
  newPosition = null;

  constructor(point, key, title) {
    this.originPosition = new BMapGL.Point(point.lng, point.lat);
    this._title = title;
    this._key = key || _.uniqueId('marker_');
  }

  /**
   * 设置新位置
   * @param {BMapGL.Point} point
   */
  setPosition = (point) => {
    this.newPosition = point;
  };

  /**
   * 获取原始位置
   * @returns
   */
  getPosition = () => {
    return this.originPosition;
  };

  /**
   * 获取最终位置
   * @returns
   */
  getFinalPosition = () => {
    return this.newPosition || this.originPosition;
  };

  get key() {
    return this._key;
  }
}

export { MarkerClusterer, MyMarker };
