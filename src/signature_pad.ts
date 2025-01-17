/**
 * The main idea and some parts of the code (e.g. drawing variable width Bézier curve) are taken from:
 * http://corner.squareup.com/2012/07/smoother-signatures.html
 *
 * Implementation of interpolation using cubic Bézier curves is taken from:
 * http://www.benknowscode.com/2012/09/path-interpolation-using-cubic-bezier_9742.html
 *
 * Algorithm for approximated length of a Bézier curve is taken from:
 * http://www.lemoda.net/maths/bezier-length/index.html
 */

import {Bezier} from './bezier';
import {IBasicPoint, Point} from './point';
import {throttle} from './throttle';
import {IBiometricPoint, IBiometricSignatureRooted} from './biometric';

declare global {
  // tslint:disable-next-line:interface-name
  interface Window {
    PointerEvent: typeof PointerEvent;
  }
}

export interface IOptions {
  dotSize?: number | (() => number);
  minWidth?: number;
  maxWidth?: number;
  minDistance?: number;
  backgroundColor?: string;
  penColor?: string;
  throttle?: number;
  velocityFilterWeight?: number;
  onBegin?: (event: any) => void;
  onEnd?: (event: any) => void;
  svgstyle?: string;
}

export interface IPointGroup {
  color: string;
  points: IBasicPoint[];
}

const round2Fixed = (num: number) => {
  return Math.round(num * 100) / 100;
};

const pixelMm = () => {
  // Return the amount of millimeters each pixel needs to be multiplicated with
  const div = document.createElement("div");
  div.style.height = "1000mm";
  div.style.width = "1000mm";
  div.style.top = "-100%";
  div.style.left = "-100%";
  div.style.position = "absolute";
  document.body.appendChild(div);
  const result = div.offsetHeight;
  document.body.removeChild(div);
  return 1 / result * 1000;
};

// const objToXML = (obj: any, tabDepth: number) => {
//   let xml = '';
//   for (let prop in obj) {
//     let tabStr = '';
//     for (let i = 0; i < tabDepth; i++) {
//       tabStr += '\t';
//     }
//     if (obj[prop] instanceof Array) {
//       for (let array in obj[prop]) {
//         xml += tabStr;
//         xml += '<' + prop + '>\n';
//         xml += objToXML(new Object(obj[prop][array]), tabDepth + 1);
//         xml += tabStr;
//         xml += '</' + prop + '>\n';
//       }
//     } else if (typeof obj[prop] === 'object') {
//       xml += tabStr;
//       xml += '<' + prop + '>';
//       xml += '\n';
//       xml += objToXML(new Object(obj[prop]), tabDepth + 1);
//       xml += tabStr;
//     } else {
//       xml += tabStr;
//       xml += '<' + prop + '>';
//       xml += obj[prop];
//     }
//     xml += obj[prop] instanceof Array ? '' : '</' + prop + '>\n';
//   }
//   return xml
// };

export default class SignaturePad {
  // Public stuff
  public dotSize: number | (() => number);
  public minWidth: number;
  public maxWidth: number;
  public minDistance: number;
  public backgroundColor: string;
  public penColor: string;
  public throttle: number;
  public velocityFilterWeight: number;
  public onBegin?: (event: any) => void;
  public onEnd?: (event: any) => void;
  public svgstyle?: string;

  // Private stuff
  /* tslint:disable: variable-name */
  private _ctx: CanvasRenderingContext2D;
  private _mouseButtonDown: boolean;
  private _isEmpty: boolean;
  private _lastPoints: Point[]; // Stores up to 4 most recent points; used to generate a new curve
  private _data: IPointGroup[]; // Stores all points in groups (one group per line or dot)
  private _pointerType: string; // mouse, pen, touch

  // Related to biometric signature
  private _pixelMm: number; // Amount of space in mm taken by a single pixel
  private _timeLastPoint: number; // Time of start
  private _time: number; // Time
  private _datetimeStarted: string;
  private _timeScale: number = 1000; // Time scaling value
  private _clientInfo: string = '';
  // private _pointerId: number = 0;

  private _lastVelocity: number;
  private _lastWidth: number;
  private _whichEvent: number; // 1: pointer  2: mouse  3: touch
  private _strokeMoveUpdate: (event: any) => void;

  /* tslint:enable: variable-name */

  constructor(
    private canvas: HTMLCanvasElement,
    private options: IOptions = {},
  ) {
    this.velocityFilterWeight = options.velocityFilterWeight || 0.7;
    this.minWidth = options.minWidth || 0.5;
    this.maxWidth = options.maxWidth || 2.5;
    this.svgstyle = options.svgstyle || "";
    this.throttle = ('throttle' in options ? options.throttle : 16) as number; // in milliseconds
    this.minDistance = ('minDistance' in options
      ? options.minDistance
      : 5) as number; // in pixels

    if (this.throttle) {
      this._strokeMoveUpdate = throttle(
        SignaturePad.prototype._strokeUpdate,
        this.throttle,
      );
    } else {
      this._strokeMoveUpdate = SignaturePad.prototype._strokeUpdate;
    }

    this.dotSize =
      options.dotSize ||
      function dotSize(this: SignaturePad) {
        return (this.minWidth + this.maxWidth) / 2;
      };
    this.penColor = options.penColor || 'black';
    this.backgroundColor = options.backgroundColor || 'rgba(0,0,0,0)';
    this.onBegin = options.onBegin;
    this.onEnd = options.onEnd;

    this._ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.clear();

    // Fetch client information to include in the biometric signature
    // this._fetchClientInfo();

    // Enable mouse and touch event handlers
    this.on();
  }

  public clear(): void {
    const ctx = this._ctx;
    const canvas = this.canvas;

    // Clear canvas using background color
    ctx.fillStyle = this.backgroundColor;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this._data = [];
    this._timeLastPoint = -1;
    this._datetimeStarted = new Date().toISOString();
    this._reset();
    this._isEmpty = true;
  }

  public fromDataURL(
    dataUrl: string,
    options: { ratio?: number; width?: number; height?: number } = {},
    callback?: (error?: ErrorEvent) => void,
  ): void {
    const image = new Image();
    const ratio = options.ratio || window.devicePixelRatio || 1;
    const width = options.width || this.canvas.width / ratio;
    const height = options.height || this.canvas.height / ratio;

    this._reset();

    image.onload = () => {
      this._ctx.drawImage(image, 0, 0, width, height);
      if (callback) {
        callback();
      }
    };
    image.onerror = (error) => {
      if (callback) {
        callback(error as ErrorEvent);
      }
    };
    image.src = dataUrl;

    this._isEmpty = false;
  }

  public toDataURL(type = 'image/png', encoderOptions?: number) {
    if (type === 'image/svg+xml') {
      return this._toSVG();
    } else {
      return this.canvas.toDataURL(type, encoderOptions);
    }
  }

  public isTouch(): boolean {
    if ('ontouchstart' in window) {
      return true;
    }
    return false;
  }

  public on(): void {
    // Disable panning/zooming when touching canvas element
    this.canvas.style.touchAction = 'none';
    this.canvas.style.msTouchAction = 'none';

    if (window.PointerEvent) {
      this._handlePointerEvents();
      this._whichEvent = 1;
    } else {
      this._handleMouseEvents();
      this._whichEvent = 2;
      if ('ontouchstart' in window) {
        this._handleTouchEvents();
        this._whichEvent = 3;
      }
    }
  }

  public off(): void {
    // Enable panning/zooming when touching canvas element
    this.canvas.style.touchAction = 'auto';
    this.canvas.style.msTouchAction = 'auto';

    this.canvas.removeEventListener('pointerdown', this._handlePointerDown);
    this.canvas.removeEventListener('pointermove', this._handlePointerMove);
    document.removeEventListener('pointerup', this._handlePointerUp);

    this.canvas.removeEventListener('mousedown', this._handleMouseDown);
    this.canvas.removeEventListener('mousemove', this._handleMouseMove);
    document.removeEventListener('mouseup', this._handleMouseUp);

    this.canvas.removeEventListener('touchstart', this._handleTouchStart);
    this.canvas.removeEventListener('touchmove', this._handleTouchMove);
    this.canvas.removeEventListener('touchend', this._handleTouchEnd);
  }

  public isEmpty(): boolean {
    return this._isEmpty;
  }

  public fromData(pointGroups: IPointGroup[]): void {
    this.clear();

    this._fromData(
      pointGroups,
      ({color, curve}) => this._drawCurve({color, curve}),
      ({color, point}) => this._drawDot({color, point}),
    );

    this._data = pointGroups;
  }

  public toData(): IPointGroup[] {
    return this._data;
  }


  // public toBiometricXML(signatureData: IBiometricSignatureRooted) {
  //   let signatureDataString = JSON.stringify(signatureData);
  //   for (const key in interfaceReplacementsMap) {
  //     signatureDataString = signatureDataString.replace(new RegExp(`"${key}":`, 'g'), `"${interfaceReplacementsMap[key]}":`)
  //   }
  //   const convertedSignatureData = JSON.parse(signatureDataString);
  //   return objToXML(convertedSignatureData, 0)
  // }

  private _inclusionField(): number {
    // X Y Z VX VY AX AY T DT F S TX TY A E R
    let inclusion = 0;
    inclusion += 0b1000000000000000; // x
    inclusion += 0b0100000000000000; // y
    // inclusion += 0b0010000000000000; // z
    // inclusion += 0b0001000000000000; // VX
    // inclusion += 0b0000100000000000; // VY
    // inclusion += 0b0000010000000000; // AX
    // inclusion += 0b0000001000000000; // AY
    inclusion += 0b0000000100000000; // time
    // inclusion += 0b0000000010000000; // duration time
    inclusion += 0b0000000000100000; // scale
    if (this.isTouch()) {
      inclusion += 0b0000000001000000; // pressure
      if (this._whichEvent === 1) {
        inclusion += 0b0000000000010000; // tiltX
        inclusion += 0b0000000000001000; // tiltY
      } else {
        inclusion += 0b0000000000000100; // azimuth
        inclusion += 0b0000000000000010; // elevation
      }
      inclusion += 0b0000000000000001; // rotation
    }
    return inclusion;
  }


  // Event handlers
  private _handlePointerDown = (event: PointerEvent): void => {
    if (event.which === 1) {
      this._mouseButtonDown = true;
      this._pointerType = event.pointerType;
      // this._pointerId = event.pointerId;
      this._strokeBegin(event);
    }
  };

  private _handlePointerMove = (event: PointerEvent): void => {
    if (this._mouseButtonDown) {
      this._strokeMoveUpdate(event);
    }
  };

  private _handlePointerUp = (event: PointerEvent): void => {
    if (event.which === 1 && this._mouseButtonDown) {
      this._mouseButtonDown = false;
      this._strokeEnd(event);
    }
  };

  private _handleMouseDown = (event: MouseEvent): void => {
    if (event.which === 1) {
      this._mouseButtonDown = true;
      this._pointerType = 'mouse';
      this._strokeBegin(event);
    }
  };

  private _handleMouseMove = (event: MouseEvent): void => {
    if (this._mouseButtonDown) {
      this._strokeMoveUpdate(event);
    }
  };

  private _handleMouseUp = (event: MouseEvent): void => {
    if (event.which === 1 && this._mouseButtonDown) {
      this._mouseButtonDown = false;
      this._strokeEnd(event);
    }
  };

  private _handleTouchStart = (event: any): void => {
    // Prevent scrolling.
    event.preventDefault();

    if (event.targetTouches.length === 1) {
      const touch = event.changedTouches[0];
      this._pointerType = touch.touchType;
      this._strokeBegin(touch);
    }
  };

  private _handleTouchMove = (event: TouchEvent): void => {
    // Prevent scrolling.
    event.preventDefault();

    const touch = event.targetTouches[0];
    this._strokeMoveUpdate(touch);
  };

  private _handleTouchEnd = (event: TouchEvent): void => {
    const wasCanvasTouched = event.target === this.canvas;
    if (wasCanvasTouched) {
      event.preventDefault();

      const touch = event.changedTouches[0];
      this._strokeEnd(touch);
    }
  };

  // Private methods
  private _strokeBegin(event: any): void {
    const newPointGroup = {
      color: this.penColor,
      points: []
    };

    if (typeof this.onBegin === 'function') {
      this.onBegin(event);
    }

    this._data.push(newPointGroup);
    this._reset();
    this._strokeUpdate(event);
  }

  private _strokeUpdate(event: any): void {
    const x = event.clientX.toFixed(0);
    const y = event.clientY.toFixed(0);

    const point = this._createPoint(x, y);
    const lastPointGroup = this._data[this._data.length - 1];
    const lastPoints = lastPointGroup ? lastPointGroup.points : [];
    const lastPoint =
      lastPoints.length > 0 && lastPoints[lastPoints.length - 1];
    const isLastPointTooClose = lastPoint
      ? point.distanceTo(lastPoint) <= this.minDistance
      : false;
    const color = lastPointGroup ? lastPointGroup.color : this.penColor;

    // Skip this point if it's too close to the previous one
    if (!lastPoint || !(lastPoint && isLastPointTooClose)) {
      const curve = this._addPoint(point);

      const d = new Date();
      if (!lastPoint) {
        this._timeLastPoint = d.getTime();
        this._drawDot({color, point});
      } else if (curve) {
        this._drawCurve({color, curve});
      }

      if (this._timeLastPoint < 0) {
        this._timeLastPoint = d.getTime();
        this._time = 0;
      } else {
        this._time = d.getTime() - this._timeLastPoint;
      }

      const pt = {
        time: point.time - this._timeLastPoint,
        x: point.x,
        y: point.y,
      };

      if (this.isTouch()) {
        if (this._whichEvent === 1) {
        } else {
        }
      }
      lastPoints.push(pt);
    }
  }

  private _strokeEnd(event: any): void {
    this._strokeUpdate(event);

    if (typeof this.onEnd === 'function') {
      this.onEnd(event);
    }
  }

  private _handlePointerEvents(): void {
    this._mouseButtonDown = false;

    this.canvas.addEventListener('pointerdown', this._handlePointerDown);
    this.canvas.addEventListener('pointermove', this._handlePointerMove);
    document.addEventListener('pointerup', this._handlePointerUp);
  }

  private _handleMouseEvents(): void {
    this._mouseButtonDown = false;

    this.canvas.addEventListener('mousedown', this._handleMouseDown);
    this.canvas.addEventListener('mousemove', this._handleMouseMove);
    document.addEventListener('mouseup', this._handleMouseUp);
  }

  private _handleTouchEvents(): void {
    this.canvas.addEventListener('touchstart', this._handleTouchStart);
    this.canvas.addEventListener('touchmove', this._handleTouchMove);
    this.canvas.addEventListener('touchend', this._handleTouchEnd);
  }

  // Called when a new line is started
  private _reset(): void {
    this._lastPoints = [];
    this._lastVelocity = 0;
    this._lastWidth = (this.minWidth + this.maxWidth) / 2;
    this._ctx.fillStyle = this.penColor;
  }

  private _createPoint(x: number, y: number): Point {
    const rect = this.canvas.getBoundingClientRect();

    return new Point(x - rect.left, y - rect.top, new Date().getTime());
  }

  // Add point to _lastPoints array and generate a new curve if there are enough points (i.e. 3)
  private _addPoint(point: Point): Bezier | null {
    const {_lastPoints} = this;

    _lastPoints.push(point);

    if (_lastPoints.length > 2) {
      // To reduce the initial lag make it work with 3 points
      // by copying the first point to the beginning.
      if (_lastPoints.length === 3) {
        _lastPoints.unshift(_lastPoints[0]);
      }

      // _points array will always have 4 points here.
      const widths = this._calculateCurveWidths(_lastPoints[1], _lastPoints[2]);
      const curve = Bezier.fromPoints(_lastPoints, widths);

      // Remove the first element from the list, so that there are no more than 4 points at any time.
      _lastPoints.shift();

      return curve;
    }

    return null;
  }

  private _calculateCurveWidths(
    startPoint: Point,
    endPoint: Point,
  ): { start: number; end: number } {
    const velocity =
      this.velocityFilterWeight * endPoint.velocityFrom(startPoint) +
      (1 - this.velocityFilterWeight) * this._lastVelocity;

    const newWidth = this._strokeWidth(velocity);

    const widths = {
      end: newWidth,
      start: this._lastWidth,
    };

    this._lastVelocity = velocity;
    this._lastWidth = newWidth;

    return widths;
  }

  private _strokeWidth(velocity: number): number {
    return Math.max(this.maxWidth / (velocity + 1), this.minWidth);
  }

  private _drawCurveSegment(x: number, y: number, width: number): void {
    const ctx = this._ctx;

    ctx.moveTo(x, y);
    ctx.arc(x, y, width, 0, 2 * Math.PI, false);
    this._isEmpty = false;
  }

  private _drawCurve({color, curve}: { color: string; curve: Bezier }): void {
    const ctx = this._ctx;
    const widthDelta = curve.endWidth - curve.startWidth;
    // '2' is just an arbitrary number here. If only lenght is used, then
    // there are gaps between curve segments :/
    const drawSteps = Math.floor(curve.length()) * 2;

    ctx.beginPath();
    ctx.fillStyle = color;

    for (let i = 0; i < drawSteps; i += 1) {
      // Calculate the Bezier (x, y) coordinate for this step.
      const t = i / drawSteps;
      const tt = t * t;
      const ttt = tt * t;
      const u = 1 - t;
      const uu = u * u;
      const uuu = uu * u;

      let x = uuu * curve.startPoint.x;
      x += 3 * uu * t * curve.control1.x;
      x += 3 * u * tt * curve.control2.x;
      x += ttt * curve.endPoint.x;

      let y = uuu * curve.startPoint.y;
      y += 3 * uu * t * curve.control1.y;
      y += 3 * u * tt * curve.control2.y;
      y += ttt * curve.endPoint.y;

      const width = Math.min(curve.startWidth + ttt * widthDelta, this.maxWidth);
      this._drawCurveSegment(x, y, width);
    }

    ctx.closePath();
    ctx.fill();
  }

  private _drawDot({
                     color,
                     point,
                   }: {
    color: string;
    point: IBasicPoint;
  }): void {
    const ctx = this._ctx;
    const width =
      typeof this.dotSize === 'function' ? this.dotSize() : this.dotSize;

    ctx.beginPath();
    this._drawCurveSegment(point.x, point.y, width);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  private _fromData(
    pointGroups: IPointGroup[],
    drawCurve: SignaturePad['_drawCurve'],
    drawDot: SignaturePad['_drawDot'],
  ): void {
    for (const group of pointGroups) {
      const {color, points} = group;

      if (points.length > 1) {
        for (let j = 0; j < points.length; j += 1) {
          const basicPoint = points[j];
          const point = new Point(basicPoint.x, basicPoint.y, basicPoint.time);

          // All points in the group have the same color, so it's enough to set
          // penColor just at the beginning.
          this.penColor = color;

          if (j === 0) {
            this._reset();
          }

          const curve = this._addPoint(point);

          if (curve) {
            drawCurve({color, curve});
          }
        }
      } else {
        this._reset();

        drawDot({
          color,
          point: points[0],
        });
      }
    }
  }

  private _toSVG(): string {
    const pointGroups = this._data;
    // const ratio = Math.max(window.devicePixelRatio || 1, 1);
    // const maxX = this.canvas.width / ratio;
    // const maxY = this.canvas.height / ratio;
    const minX = 0;
    const minY = 0;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    svg.setAttribute('width', this.canvas.width.toString());
    svg.setAttribute('height', this.canvas.height.toString());

    this._fromData(
      pointGroups,

      ({color, curve}: { color: string; curve: Bezier }) => {
        const path = document.createElement('path');

        // Need to check curve for NaN values, these pop up when drawing
        // lines on the canvas that are not continuous. E.g. Sharp corners
        // or stopping mid-stroke and than continuing without lifting mouse.
        /* eslint-disable no-restricted-globals */
        if (
          !isNaN(curve.control1.x) &&
          !isNaN(curve.control1.y) &&
          !isNaN(curve.control2.x) &&
          !isNaN(curve.control2.y)
        ) {
          const attr =
            `M ${curve.startPoint.x.toFixed(0)},${curve.startPoint.y.toFixed( 0,)} ` +
            `C ${curve.control1.x.toFixed(0)},${curve.control1.y.toFixed(0)} ` +
            `${curve.control2.x.toFixed(0)},${curve.control2.y.toFixed(0)} ` +
            `${curve.endPoint.x.toFixed(0)},${curve.endPoint.y.toFixed(0)}`;
          path.setAttribute('d', attr);
          path.setAttribute('stroke-width', (curve.endWidth * 2.25).toFixed(4));
          path.setAttribute('stroke', color);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke-linecap', 'round');

          svg.appendChild(path);
        }
        /* eslint-enable no-restricted-globals */
      },

      ({color, point}: { color: string; point: IBasicPoint }) => {
        const circle = document.createElement('circle');
        const dotSize =
          typeof this.dotSize === 'function' ? this.dotSize() : this.dotSize;
        circle.setAttribute('r', dotSize.toString());
        circle.setAttribute('cx', point.x.toString());
        circle.setAttribute('cy', point.y.toString());
        circle.setAttribute('fill', color);

        svg.appendChild(circle);
      },
    );

    const prefix = 'data:image/svg+xml;base64,';
    const header =
      '<svg' +
      ' xmlns="http://www.w3.org/2000/svg"' +
      ' xmlns:xlink="http://www.w3.org/1999/xlink"' +
      ` viewBox="${minX} ${minY} ${this.canvas.width} ${this.canvas.height}"` +
      ` width="${this.canvas.width}"` +
      ` height="${this.canvas.height}"` +
      '>';
    let body = svg.innerHTML;

    // IE hack for missing innerHTML property on SVGElement
    // noinspection TypeScriptValidateTypes
    if (body === undefined) {
      const dummy = document.createElement('dummy');
      const nodes = svg.childNodes;
      dummy.innerHTML = '';

      // tslint:disable-next-line: prefer-for-of
      for (let i = 0; i < nodes.length; i += 1) {
        dummy.appendChild(nodes[i].cloneNode(true));
      }

      body = dummy.innerHTML;
    }

    const footer = '</svg>';
    let style = '';
    if (this.svgstyle) {
      const styletag = document.createElement('style');
      styletag.type = 'text/css';
      styletag.appendChild(document.createTextNode(this.svgstyle)); // Support for the rest
      svg.appendChild(styletag);
        style = "<style>" + styletag.innerHTML + "</style>"
    }
    const data = header + body + style + footer;

    return prefix + btoa(data);
  }
}
