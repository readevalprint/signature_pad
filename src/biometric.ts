export interface IPenTipCoord {
  cx: number; // cmn:X
  cy: number; // cmn:Y
}

export interface IPenOrient {
  tax?: number; // sig:TiltAlongX
  tay?: number; // sig:TiltAlongY
  pa?: number; // sig:PenAzimuth
  pe?: number; // sig:PenElevation
  pr: number; // sig:PenRotation
}

// The output of the signature library needs to take a minimum space
export interface IBiometricPoint {
  tc: number; // sig:TimeChannel
  ptc: IPenTipCoord; // sig:PenTipCoord
  fc?: number; // sig:FChannel
  po?: IPenOrient; // sig:PenOrient
}

export interface IBiometricVersion {
  maj: number; // cmn:Major
  min: number; // cmn:Minor
}

export interface IBiometricCaptureDeviceID {
  org: number; // cmn:Organization
  ident: string; // cmn:Identifier
}

export interface IBiometricCaptureDevice {
  did: IBiometricCaptureDeviceID; // sig:DeviceID
  tec: string; // sig:DeviceTechnology - "Unknown" (finger) or "Electromagnetic" (Digitizer Stylus). Can we add "Mouse" if a Mouse is used (from PointerEvent.pointerType)?
}

export interface IBiometricChannelDescription {
  scVal: number; // sig:ScalingValue
  minVal: number; // sig:MinChannelValue
  maxVal: number; // sig:MaxChannelValue
}

export interface IBiometricChannels {
  // Keys: sig:PenTipOrientationChannelDescription, sig:TChannelDescription, sig:FChannelDescription
  [key: string]: IBiometricChannelDescription;
}

export interface IBiometricSamplePointList {
  sp: IBiometricPoint[]; // sig:SamplePoint
}

export interface IBiometricRepresentation {
  dt: string; // sig:CaptureDateAndTime - YYYY-MM-DDThh:mm:ss (the datetime when capturing started)
  dev: IBiometricCaptureDevice; // sig:CaptureDevice
  inc: string; // sig:InclusionField
  cdl: IBiometricChannels; // sig:ChannelDescriptionList
  spl: IBiometricSamplePointList; // sig:SamplePointList
}

export interface IBiometricRepresentationList {
  r: IBiometricRepresentation; // sig:Representation
}

export interface IBiometricVendorSpecificData {
  typecode: number; // cmn:TypeCode
  data: string; // cmn:Data
}

// sig:SignatureSignTimeSeries
export interface IBiometricSignature {
  v: IBiometricVersion; // sig:Version
  rl: IBiometricRepresentationList; // sig:RepresentationList
  vsd: IBiometricVendorSpecificData; // sig:VendorSpecificData
}

export interface IBiometricSignatureRooted {
  root: IBiometricSignature; // sig:SignatureSignTimeSeries
}

// export const interfaceReplacementsMap: any = {
//   cx: 'cmn:X',
//   cy: 'cmn:Y',
//   tax: 'sig:TiltAlongX',
//   tay: 'sig:TiltAlongY',
//   pa: 'sig:PenAzimuth',
//   pe: 'sig:PenElevation',
//   pr: 'sig:PenRotation',
//   tc: 'sig:TimeChannel',
//   ptc: 'sig:PenTipCoord',
//   fc: 'sig:FChannel',
//   po: 'sig:PenOrient',
//   maj: 'cmn:Major',
//   min: 'cmn:Minor',
//   org: 'cmn:Organization',
//   ident: 'cmn:Identifier',
//   did: 'sig:DeviceID',
//   tec: 'sig:DeviceTechnology',
//   scVal: 'sig:ScalingValue',
//   minVal: 'sig:MinChannelValue',
//   maxVal: 'sig:MaxChannelValue',
//   sp: 'sig:SamplePoint',
//   dt: 'sig:CaptureDateAndTime',
//   dev: 'sig:CaptureDevice',
//   inc: 'sig:InclusionField',
//   cdl: 'sig:ChannelDescriptionList',
//   spl: 'sig:SamplePointList',
//   r: 'sig:Representation',
//   typecode: 'cmn:TypeCode',
//   data: 'cmn:Data',
//   v: 'sig:Version',
//   rl: 'sig:RepresentationList',
//   vsd: 'sig:VendorSpecificData',
//   root: 'sig:SignatureSignTimeSeries'
// };
