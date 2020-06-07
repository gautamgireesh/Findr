import React from 'react';
import styles from '../assets/styles';

import { Text, View, Image, Dimensions, TouchableOpacity } from 'react-native';
import Icon from './Icon';

const CardItem = ({
  actions,
  description,
  image,
  name,
  courses,
  onPressLeft,
  onPressRight,
  status,
  variant
}) => {
  // Custom styling
  const fullWidth = Dimensions.get('window').width;
  const fullHeight = Dimensions.get('window').height;

  const imageStyle = [
    {
      width: variant ? fullWidth / 2 - 30 : styles.containerCardItem.width, 
      height: variant ? 120 : 250,
      // margin: variant ? 0 : 20 
      margin: 0,
      borderTopLeftRadius: variant ? 0 : 40,
      borderTopRightRadius: variant ? 0 : 40,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
    }
  ];

  const nameStyle = [
    {
      paddingTop: variant ? 10 : 15,
      paddingBottom: variant ? 5 : 7,
      color: '#1a5d57',
      fontSize: variant ? 15 : 30,
      alignSelf: 'center',
      fontWeight: "300",
      overflow: 'visible'
    }
  ];

  const CourseHeaderStyle = [
    {
      paddingTop: variant ? 10 : 15,
      paddingBottom: variant ? 5 : 7,
      color: '#757E90',
      fontSize: variant ? 5 : 19,
      alignSelf: 'center'
    }
  ];

  const theHeight = [
    {
      height: variant ? fullHeight - 600: fullHeight - 210,
    }
  ]

  return (
    <View style={[variant ? styles.matchContainerCardItem : styles.containerCardItem, theHeight]}>
      {/* IMAGE */}
      <Image source={image} style={imageStyle} resizeMode='cover'/>

      {/* MATCHES */}
      {/* {matches && (
        <View style={styles.matchesCardItem}>
          <Text style={styles.matchesTextCardItem}>
            <Icon name="heart" /> {matches}% Match!
          </Text>
        </View>
      )} */}

      {/* NAME */}
      <Text style={nameStyle}>{name}</Text>

      {/* Courses */}
      {courses && <Text style={CourseHeaderStyle}>
        {courses.map((item, index) => (
          <Text key={String(index)} >
            {index === courses.length - 1 ? " " + item : " " + item + ","}
          </Text>
        ))}
      </Text>}
      

      {/* DESCRIPTION */}
      {description && (
        <Text style={styles.descriptionCardItem}>{description}</Text>
      )}

      {/* STATUS */}
      {status && (
        <View style={styles.status}>
          <View style={status === 'Online' ? styles.online : styles.offline} />
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}

      {/* ACTIONS */}
      {actions && (
        <View style={styles.actionsCardItem}>

          <TouchableOpacity
            style={styles.button}
            onPress={() => onPressLeft()}
          >
            <Text style={styles.dislike}>
              <Icon name="dislike" />
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={() => onPressRight()}>
            <Text style={styles.like}>
              <Icon name="like" />
            </Text>
          </TouchableOpacity>

        </View>
      )}
    </View>
  );
};

export default CardItem;
