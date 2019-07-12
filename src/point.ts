// Interface for point data structure used e.g. in SignaturePad#fromData method
export interface IBasicPoint {
  pressure: number;
  rotation: number;
  tiltX: number;
  tiltY: number;
  time: number;
  x: number;
  y: number;
}

export class Point implements IBasicPoint {
  public pressure: number;
  public rotation: number;
  public time: number;
  public tiltX: number;
  public tiltY: number;

  constructor(public x: number, public y: number, time?: number, pressure?: number) {
    this.time = time || Date.now();
    this.pressure = pressure || -1;
    this.rotation = 0;
    this.tiltX = 0;
    this.tiltY = 0;
  }

  public distanceTo(start: IBasicPoint): number {
    return Math.sqrt(
      Math.pow(this.x - start.x, 2) + Math.pow(this.y - start.y, 2),
    );
  }

  public equals(other: IBasicPoint): boolean {
    return this.x === other.x && this.y === other.y && this.time === other.time;
  }

  public velocityFrom(start: IBasicPoint): number {
    return this.time !== start.time
      ? this.distanceTo(start) / (this.time - start.time)
      : 0;
  }
}
