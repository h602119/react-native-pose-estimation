import React, {useEffect, useMemo, useState} from 'react';
import {Dimensions, StatusBar, StyleSheet, Text, View} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useFrameProcessor,
  useCameraFormat,
} from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin'
//import {getBestFormat} from './formatFilter';
import { Canvas, Circle, Path} from "@shopify/react-native-skia";  
import {TensorflowModel, useTensorflowModel} from 'react-native-fast-tflite';
import { useSharedValue } from 'react-native-worklets-core';

type Point = {
  y: number;
  x: number;
  confidence: number;
};


//The function that sets points from (normalized 0-1) back to regular screen.
function processOutputs(outputs: number[], modelsize:number, previewSize:number):Point[] {
  'worklet';

  // model : 192 x 192
  // image :  w: 1920, h: 1080
  // device : w: 423.52942, h: 883.137271 

  return outputs.slice(5*3).map((value, index, array) => {
    if(index % 3 === 0) {
      return {
        x: ((1-array[index])* (423)),
        y: ((1-array[index + 1])* (883.137271)),
        confidence: array[index + 2],
      };
    }
  }).filter((point): point is Point => point !== undefined);
};



function App() {

  // Height and width of the device itself.
  const deviceHeight = useSharedValue(Dimensions.get('window').height)
  const deviceWidth = useSharedValue(Dimensions.get('window').width)
  //console.log(`{width: ${deviceWidth}, height:${deviceHeight}}`)

  const [hasPermission, setHasPermission] = useState(false)
  const model = useTensorflowModel(require('./assets/thunder.tflite'))
  const { resize } = useResizePlugin()
  

  const [points, setPoints] = useState<Point[]>([]);
  

  useEffect( () => {
    Camera.requestCameraPermission().then((p) =>
    setHasPermission(p === 'granted')
    )
  }, [])


  const device = useCameraDevice('front')
  const format = useCameraFormat(device, [
    {videoAspectRatio: 16/9},
    {fps: 60},
  ])


  const plugin = model.state === 'loaded' ? model.model : undefined


  const updatePoints = Worklets.createRunInJsFn((newPoints: Point[]) => {
    setPoints(newPoints);
  })

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet'

    if (plugin == null) {
      return
    }
    

    // This version of Lighning takes 192x192, rgb, uint8 frames
    // This version of Thunder takes 256x256, rgb, uint8 frames
    const resized = resize(frame, {
      scale: {
        width: 256,
        height: 256,
      },
      crop: {
        y: 0,
        x: 0,
        // 16:9 aspect ratio because we scale to 192x192
        width: frame.width,
        height: frame.height
      },
      pixelFormat: 'rgb',
      dataType: 'uint8',})

    const outputs = plugin.runSync([resized])

    //console.log(`{FH${frame.height}, FW${frame.width}}`)

    const outputArray = Array.from(outputs[0] as unknown as number[]);

    const newPoints = processOutputs(outputArray, (192), (frame.width));

    updatePoints(newPoints)

    //Print the width height of the frame captured by the camera
    //console.log(`{width: ${frame.width}, height:${frame.height}}`)
      
  }, [plugin, updatePoints])





  return (

    <View style={StyleSheet.absoluteFill}>
        {!hasPermission && <Text style={styles.text}>No Camera Permission.</Text>}

        {hasPermission && device != null && (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          frameProcessor={frameProcessor}
          pixelFormat='yuv'
          format={format}
        />
      )}

      {points.length > 3 && 
      (<Canvas style={styles.canvas}>
        
          {/* 0 ==> Nose ==> Green*/}
          {/* <Circle cx={points[0].x} cy={points[0].y} r={5} color="green"/> */}

          {/* 1 ==> Left Eye ==> Red*/}
          {/* <Circle cx={points[1].x} cy={points[1].y} r={5} color="red"/> */}

          {/* 2 ==> Right Eye ==> Blue*/}
          {/* <Circle cx={points[2].x} cy={points[2].y} r={5} color="blue"/> */}

          {/*Print Every circle from 5->...*/}
          {points.map((point, index) => (
          <Circle cx={point.x} cy={point.y} r={5} color="red" />
          ))}

          {/*Black border around 192x192 model output*/}
          <Path path="M 2 2 H 194 V 194 H 2 Z"
        color="black"
        style="stroke"
        strokeJoin="round"
        strokeWidth={5}
        start={0}
        end={1}/>
      </Canvas>)}


    </View>


  )

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  text: {
    color: 'white',
    fontSize: 20,
  },
  canvas: {
    width: '100%',
    height: '100%',
  },
  pointsText: {
    color: 'white',
    fontSize: 20,
    marginTop: '50%',
  }
});

export default App;
