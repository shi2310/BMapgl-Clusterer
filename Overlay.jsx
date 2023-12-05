import icon from '@/assets/icon/0.png';
import { Space } from 'antd';
import moment from 'moment';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { CustomOverlay, Polyline } from 'react-bmapgl';
import styles from './Overlays.less';
import { MarkerClusterer, MyMarker } from './markerClusterer';

const pointFunc = (value) => {
  if (value) {
    const v = value.split(',');
    return { lng: v[0], lat: v[1] };
  } else {
    return { lng: 121.698163, lat: 31.730767 };
  }
};

const badge = (count) => {
  if (count > 0) {
    return <span className={styles.badge}>{count > 100 ? '99+' : count}</span>;
  }
};

const Index = ({ map, list, onMarkerClick }) => {
  const [current, setCurrent] = useState(null);
  const [areas, setAreas] = useState([]);
  const [lines, setLines] = useState([]);
  const clusterRef = useRef();

  useEffect(() => {
    clusterRef.current = new MarkerClusterer(map, {
      onClustersChange: (data) => {
        const _areas = [];
        let _lines = [];
        _.each(data, (o) => {
          _.each(o._markers, (m) => {
            const area = _.find(list, { guid: m.key });
            if (area) {
              _areas.push({ ...area, position: m.getFinalPosition() });
            }
          });
          _lines = _lines.concat(o._lines);
        });
        setAreas(_areas);
        setLines(_lines);
      },
    });

    return () => {
      clusterRef.current.dispose();
      clusterRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (clusterRef.current && list) {
      const markers = _.map(list, (o) => new MyMarker(pointFunc(o.position), o.guid, o.name));
      clusterRef.current.addMarkers(markers);
    }
  }, [list]);

  const renderMarker = useMemo(() => {
    const markers = _.map(areas, (o, i) => (
      <CustomOverlay
        position={o.position}
        offset={new BMapGL.Size(-5, 38)}
        unit="px"
        zIndex={current === i.toString() ? 99 : 2}
        key={i}
      >
        <div
          className={styles.marker}
          onMouseOver={() => {
            setCurrent(i.toString());
          }}
          onMouseOut={() => {
            setCurrent(null);
          }}
          onClick={() => {
            onMarkerClick && onMarkerClick(o);
          }}
        >
          <img width={25} src={icon} />
          <div className={styles.label}>
            <Space>
              {o.name} {badge(o.count)}
            </Space>
            {o.areaSpeed && (
              <div>
                <span>速度:{o.areaSpeed.speed}</span>
                <span style={{ marginLeft: '10px' }}>
                  {moment(o.areaSpeed.time).format('MM-DD HH:mm')}
                </span>
              </div>
            )}
          </div>
        </div>
      </CustomOverlay>
    ));
    return markers;
  }, [areas, current]);

  const renderLine = useMemo(() => {
    return _.map(lines, (o, i) => <Polyline path={o} strokeWeight={1} key={i} />);
  }, [lines]);

  return (
    <>
      {renderMarker}
      {renderLine}
    </>
  );
};

export default memo(Index);
