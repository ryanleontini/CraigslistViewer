import logo from './logo.svg';
import backupImg from './noImage.jpeg';
import './App.css';
import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import { Pagination } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/pagination';

function App() {
  const [listings, setListings] = useState([]);
  const [lastRunTime, setLastRunTime] = useState('');

  // Retrieve current listings.
  useEffect(() => {
    axios.get('https://mccune.shop/listings')
      .then(response => {
        setListings(response.data);
      })
      .catch(error => {
        console.error('Error:', error);
      });
  }, []);

  useEffect(() => {
    fetchLastRunTime();
  }, []);

  const fetchLastRunTime = async () => {
    try {
        const response = await fetch('https://mccune.shop/lastRunTime');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setLastRunTime(data.lastRunTime);
    } catch (error) {
        console.error("Failed to fetch last run time:", error);
        // Handle the error appropriately in your app
    }
  };

function formatTime(timestamp) {
  const date = new Date(parseInt(timestamp));
  let hours = date.getHours();
  let minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';

  // Convert hours to 12-hour format
  hours = hours % 12;
  // The hour '0' should be '12'
  hours = hours ? hours : 12;

  // Pad the minutes with a leading zero if less than 10
  minutes = minutes < 10 ? '0' + minutes : minutes;

  // Format the time in HH:MM AM/PM format
  return `${hours}:${minutes} ${ampm}`;
}


  const formattedTime = formatTime(lastRunTime);

  return (
    <div className="App">
        <header className='navBar'>
          <div className='navBarLeft'></div>
          <div className='navTitle'>The Shop</div>
          <div className='updateTime'>Last Updated: {formattedTime}</div>
        </header>
        <div className="container">
          <div className='searchResult'>
            {listings.map((item, index) => (
              <Swiper 
                pagination={true} 
                navigation={true}
                modules={[Pagination, Navigation]} 
                className="mySwiper"
              >
                <div className="searchTerm">{item.Term}</div>
                  {item.Listings.map((listing, listingIndex) => (
                    <SwiperSlide key={listingIndex}>
                      <div className='swiperContent'>
                        <img 
                        alt="Image Unavailable" 
                        src={listing.Image || backupImg} 
                        className='swipeImg'
                        onError={(e) => {
                          e.target.onerror = null; // prevent endless loop if fallback image fails to load
                          e.target.src = backupImg;
                        }}
                        />
                        <div className='meta'>
                          <div className='priceDiv'><div className='price'>{listing.Price}</div><div>{listing.Odometer}</div></div>
                          <div className='nameDiv'><div>{listing.Location}</div><div>{listing.Name}</div></div>
                          <div className='buttonDiv'><button className='viewButton'><a href={listing.Link}>View</a></button></div>

                        </div>
                      </div>

                    </SwiperSlide>
                  ))}    
              </Swiper>
            ))}
          </div>
        </div>
    </div>
  );
}

export default App;
