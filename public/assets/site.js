
    (function(){
      'use strict';
      var reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var videos=Array.prototype.slice.call(document.querySelectorAll('video'));
      var managedVideos=videos;
      var videoSources=new WeakMap();
      var playbackState=new WeakMap();
      var anatomy=document.querySelector('.anatomy-scroll');
      var anatomyVideos=Array.prototype.slice.call(document.querySelectorAll('.anatomy-layer video'));
      var anatomyData=[
        ['Electrode','R&D / Pilot','Electrode coating process development — slurry, slot-die coating, and drying, dialing in loading, adhesion, and uniformity at R&D and pilot scale.'],
        ['Separator','R&D / Pilot','Separator evaluation and integration — testing coated separators for lithium-metal and lithium-sulfur cells through R&D and pilot builds.'],
        ['Cell Assembly','Mass Production','High-volume prismatic cell assembly — jelly roll tab welding, top-cap joining, casing insertion, and seam welding; plus laser welding, insulation wrapping, and ultrasonic welding on 24/7 production lines.'],
        ['Electrolyte & Activation','R&D / Pilot','At Lyten, electrolyte formulation and cell activation — additive studies, controlled filling, and formation cycling for lithium-metal and lithium-sulfur chemistries.'],
        ['Module','Mass Production','Module and pack manufacturing — cell stacking, robotic assembly, interconnect welding, and busbar welding at production volume.']
      ];
      var activeStage=0;
      var playRetryDelays=[250,500,1000,2000,4000,8000,12000];
      var sourceWaitDelays=[50,100,200,400,800,1600,3200,5000,5000,5000,5000];

      function videoSource(video){
        return videoSources.get(video)||video.getAttribute('src')||video.dataset.src||video.dataset.dataHatchSrc||video.dataset.hatchSrc||'';
      }
      function prepareVideo(video){
        var poster=video.dataset.hatchPoster;
        if(poster)video.poster=poster;
      }
      function newPlaybackState(video){
        return {lastTime:0,lastAdvance:performance.now(),lastRecovery:0,lastReadyState:video.readyState,recoveryCount:0,playPending:false,framePending:false,frameCallbackId:null,tracksFrames:typeof video.requestVideoFrameCallback==='function',sourceReady:false,sourcePromise:null,loadPromise:null,stallEvidence:false,waitingSince:0,visibilityPaused:false};
      }
      function stateFor(video){
        var state=playbackState.get(video);
        if(!state){
          state=newPlaybackState(video);
          playbackState.set(video,state);
        }
        return state;
      }
      function markAdvance(video,mediaTime){
        var state=stateFor(video);
        state.lastTime=typeof mediaTime==='number'?mediaTime:video.currentTime;
        state.lastAdvance=performance.now();
        state.stallEvidence=false;
        state.waitingSince=0;
      }
      function watchDecodedFrames(video){
        var state=stateFor(video);
        if(!state.tracksFrames||state.framePending)return;
        state.framePending=true;
        state.frameCallbackId=video.requestVideoFrameCallback(function(now,metadata){
          state.framePending=false;
          state.frameCallbackId=null;
          markAdvance(video,metadata.mediaTime);
          if(!video.paused&&!video.ended)watchDecodedFrames(video);
        });
      }
      function stopDecodedFrameWatch(video){
        var state=stateFor(video);
        if(state.framePending&&state.frameCallbackId!==null&&typeof video.cancelVideoFrameCallback==='function'){
          video.cancelVideoFrameCallback(state.frameCallbackId);
        }
        state.framePending=false;
        state.frameCallbackId=null;
      }
      function urlIsReady(video){
        var value=video.getAttribute('src')||'';
        return !!value&&value!=='about:blank';
      }
      function waitForVideoUrl(video,source){
        var state=stateFor(video);
        if(state.sourceReady&&urlIsReady(video))return Promise.resolve(true);
        if(state.sourcePromise)return state.sourcePromise;
        state.sourcePromise=new Promise(function(resolve){
          var settled=false,attempt=0,timer=null,observer=null;
          function finish(ready){
            if(settled)return;
            settled=true;
            if(timer!==null)window.clearTimeout(timer);
            if(observer)observer.disconnect();
            state.sourceReady=ready;
            resolve(ready);
          }
          function check(){
            if(urlIsReady(video)){finish(true);return}
            if(attempt>=sourceWaitDelays.length){finish(false);return}
            timer=window.setTimeout(check,sourceWaitDelays[attempt++]);
          }
          if(typeof MutationObserver==='function'){
            observer=new MutationObserver(function(){if(urlIsReady(video))finish(true)});
            observer.observe(video,{attributes:true,attributeFilter:['src']});
          }
          if(!urlIsReady(video))video.src=source;
          Promise.resolve().then(check);
        }).then(function(ready){
          state.sourcePromise=null;
          return ready;
        });
        return state.sourcePromise;
      }
      function loadVideo(video){
        if(!video||reduced)return Promise.resolve(false);
        var state=stateFor(video);
        if(state.loadPromise)return state.loadPromise;
        prepareVideo(video);
        var source=videoSource(video);
        if(!source)return Promise.resolve(false);
        video.preload=video.hasAttribute('autoplay')?'auto':'metadata';
        video.dataset.loaded='true';
        state.loadPromise=waitForVideoUrl(video,source).then(function(ready){
          if(!ready)return false;
          markAdvance(video,video.currentTime||0);
          video.load();
          return true;
        }).then(function(ready){
          if(!ready)state.loadPromise=null;
          return ready;
        });
        return state.loadPromise;
      }
      managedVideos.forEach(function(video){
        prepareVideo(video);
        var source=videoSource(video);
        if(source)videoSources.set(video,source);
        playbackState.set(video,newPlaybackState(video));
        video.preload=video.hasAttribute('autoplay')?'auto':'metadata';
        video.addEventListener('playing',function(){
          var state=stateFor(video);
          video.classList.add('is-playing');
          state.lastTime=video.currentTime;
          state.lastAdvance=performance.now();
          state.recoveryCount=0;
          state.stallEvidence=false;
          state.waitingSince=0;
          watchDecodedFrames(video);
        });
        video.addEventListener('timeupdate',function(){
          var state=stateFor(video);
          if(!state.tracksFrames)markAdvance(video,video.currentTime);
          else state.lastTime=video.currentTime;
        });
        video.addEventListener('pause',function(){video.classList.remove('is-playing')});
        video.addEventListener('loadeddata',function(){safePlay(video,0,true)});
        video.addEventListener('canplay',function(){safePlay(video,0,true)});
        function recordStall(){
          var state=stateFor(video);
          state.stallEvidence=true;
          state.waitingSince=performance.now();
          window.setTimeout(function(){recoverPlayback(video)},1200);
        }
        video.addEventListener('stalled',recordStall);
        video.addEventListener('waiting',recordStall);
      });
      function eligible(video){
        if(document.hidden||reduced||video.dataset.inView!=='true')return false;
        var layer=video.closest('.anatomy-layer');
        return !layer||Number(layer.dataset.layer)===activeStage;
      }
      function resumeAllowed(video){
        var state=stateFor(video),layer=video.closest('.anatomy-layer');
        return !document.hidden&&!reduced&&!state.visibilityPaused&&(!layer||Number(layer.dataset.layer)===activeStage);
      }
      function safePlay(video,attempt,forceResume){
        if(!video||reduced)return;
        var state=stateFor(video);
        loadVideo(video).then(function(ready){
          if(!ready||!(forceResume?resumeAllowed(video):eligible(video)))return;
          video.muted=true;
          video.defaultMuted=true;
          if(!forceResume&&!video.paused&&!video.ended){
            watchDecodedFrames(video);
            return;
          }
          if(state.playPending)return;
          state.playPending=true;
          var promise;
          try{promise=video.play()}catch(error){promise=Promise.reject(error)}
          if(promise&&promise.catch){
            promise.then(function(){
              state.playPending=false;
              if(!video.paused){video.classList.add('is-playing');watchDecodedFrames(video)}
            }).catch(function(error){
              state.playPending=false;
              video.classList.remove('is-playing');
              console.warn('Video playback failed',{source:video.currentSrc||videoSource(video),reason:error&&error.name?error.name:String(error||'unknown'),mediaErrorCode:video.error?video.error.code:null,networkState:video.networkState,readyState:video.readyState});
              var nextAttempt=(attempt||0)+1;
              if(nextAttempt<=playRetryDelays.length)window.setTimeout(function(){safePlay(video,nextAttempt,forceResume)},playRetryDelays[nextAttempt-1]);
            });
          }else{
            state.playPending=false;
          }
        });
      }
      function pauseVideo(video,forVisibility){
        var state=stateFor(video);
        state.visibilityPaused=!!forVisibility;
        state.playPending=false;
        stopDecodedFrameWatch(video);
        video.pause();
        video.classList.remove('is-playing');
      }
      function recoverPlayback(video){
        var state=stateFor(video),now=performance.now();
        var readyStateRollback=state.lastReadyState>=2&&video.readyState<2;
        var longStagnation=!video.paused&&!video.ended&&!video.seeking&&video.readyState>=2&&now-state.lastAdvance>12000;
        if(!state.stallEvidence&&!readyStateRollback&&!longStagnation)return;
        if(now-state.lastRecovery<1800)return;
        state.lastRecovery=now;
        state.recoveryCount+=1;
        state.stallEvidence=false;
        state.waitingSince=0;
        state.playPending=false;
        if(state.sourceReady&&video.readyState===0&&video.networkState===HTMLMediaElement.NETWORK_NO_SOURCE)video.load();
        window.setTimeout(function(){safePlay(video,0,true)},120);
      }
      function reconcilePlayback(){
        var now=performance.now();
        managedVideos.forEach(function(video){
          if(video.dataset.loaded!=='true')return;
          var state=stateFor(video),time=video.currentTime,previousReadyState=state.lastReadyState;
          state.lastReadyState=video.readyState;
          if(!resumeAllowed(video))return;
          if(video.paused||video.ended){safePlay(video,0,true);return}
          if(!state.tracksFrames&&Math.abs(time-state.lastTime)>.04){markAdvance(video,time);return}
          if(previousReadyState>=2&&video.readyState<2)state.stallEvidence=true;
          if(state.stallEvidence||(!video.seeking&&video.readyState>=2&&now-state.lastAdvance>12000))recoverPlayback(video);
        });
      }

      var gestureRetried=false;
      function retryLoadedVideosAfterGesture(){
        if(gestureRetried)return;
        gestureRetried=true;
        document.removeEventListener('touchend',retryLoadedVideosAfterGesture);
        document.removeEventListener('click',retryLoadedVideosAfterGesture);
        managedVideos.forEach(function(video){if(video.dataset.loaded==='true')safePlay(video,0)});
      }
      document.addEventListener('touchend',retryLoadedVideosAfterGesture,{passive:true});
      document.addEventListener('click',retryLoadedVideosAfterGesture);

      var frameObserver=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          var video=entry.target.querySelector('video');
          if(!video)return;
          video.dataset.inView=entry.isIntersecting?'true':'false';
          stateFor(video).visibilityPaused=!entry.isIntersecting;
          if(entry.isIntersecting){loadVideo(video);safePlay(video,0)}else{pauseVideo(video,true)}
        });
      },{rootMargin:'200px 0px 200px 0px',threshold:0});
      document.querySelectorAll('.hero-media,.journey-chapter').forEach(function(frame){frameObserver.observe(frame)});

      var anatomyObserver=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          anatomy.dataset.inView=entry.isIntersecting?'true':'false';
          anatomyVideos.forEach(function(video,i){
            video.dataset.inView=entry.isIntersecting&&i===activeStage?'true':'false';
            stateFor(video).visibilityPaused=!(entry.isIntersecting&&i===activeStage);
            if(entry.isIntersecting&&i===activeStage){loadVideo(video);safePlay(video,0)}else pauseVideo(video,true);
          });
        });
      },{rootMargin:'200px 0px 200px 0px',threshold:0});
      if(anatomy){anatomyObserver.observe(anatomy);}

      function setStage(index){
        index=Math.max(0,Math.min(4,index));
        activeStage=index;
        document.querySelectorAll('.anatomy-layer').forEach(function(layer,i){layer.classList.toggle('active',i===index)});
        document.querySelector('.anatomy-count').textContent=String(index+1).padStart(2,'0')+' / 05';
        document.querySelector('.anatomy-copy h2').textContent=anatomyData[index][0];
        document.querySelector('.anatomy-copy .anatomy-phase').textContent=anatomyData[index][1];
        document.querySelector('.anatomy-copy p').textContent=anatomyData[index][2];
        document.querySelectorAll('.step-button').forEach(function(button,i){button.classList.toggle('active',i===index);button.setAttribute('aria-current',i===index?'step':'false')});
        anatomyVideos.forEach(function(video,i){
          var shouldLoad=anatomy.dataset.inView==='true'&&i===index;
          video.dataset.inView=shouldLoad?'true':'false';
          stateFor(video).visibilityPaused=!shouldLoad;
          if(shouldLoad){loadVideo(video);safePlay(video,0)}else pauseVideo(video,true);
        });
      }
      function anatomyProgress(){
        if(!anatomy||reduced)return;
        var rect=anatomy.getBoundingClientRect();
        var distance=anatomy.offsetHeight-window.innerHeight;
        if(rect.top<=0&&rect.bottom>=window.innerHeight){
          var progress=Math.max(0,Math.min(.9999,-rect.top/Math.max(distance,1)));
          var next=Math.floor(progress*5);
          if(next!==activeStage)setStage(next);
        }
      }
      document.querySelectorAll('.step-button').forEach(function(button){button.addEventListener('click',function(){
        var index=Number(button.dataset.step),distance=anatomy.offsetHeight-window.innerHeight;
        window.scrollTo({top:anatomy.offsetTop+distance*(index+.5)/5,behavior:reduced?'auto':'smooth'});
      })});

      var nav=document.querySelector('.nav'),menu=document.querySelector('.menu-button'),navLinks=document.querySelector('.nav-links');
      function menuIsOpen(){return navLinks.classList.contains('open')}
      function openMenu(){navLinks.classList.add('open');menu.classList.add('open');menu.setAttribute('aria-expanded','true');menu.setAttribute('aria-label','Close navigation')}
      function closeMenu(returnFocus){navLinks.classList.remove('open');menu.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');if(returnFocus)menu.focus()}
      menu.addEventListener('click',function(){if(menuIsOpen())closeMenu(true);else openMenu()});
      navLinks.querySelectorAll('a').forEach(function(link){link.addEventListener('click',function(){closeMenu(false)})});
      document.addEventListener('keydown',function(e){
        if(!menuIsOpen())return;
        if(e.key==='Escape'){closeMenu(true);return}
        if(e.key==='Tab'){
          var focusables=[menu].concat(Array.prototype.slice.call(navLinks.querySelectorAll('a[href]')));
          var first=focusables[0],last=focusables[focusables.length-1];
          if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
          else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
        }
      });

      var ticking=false;
      window.addEventListener('scroll',function(){if(ticking)return;ticking=true;requestAnimationFrame(function(){nav.classList.toggle('compact',window.scrollY>12);anatomyProgress();ticking=false})},{passive:true});
      document.addEventListener('visibilitychange',function(){managedVideos.forEach(function(video){if(document.hidden)pauseVideo(video,true);else if(video.dataset.loaded==='true'){stateFor(video).visibilityPaused=video.dataset.inView!=='true';safePlay(video,0,true)}})});
      window.addEventListener('pageshow',function(){managedVideos.forEach(function(video){if(video.dataset.loaded==='true')safePlay(video,0,true)})});
      window.setInterval(reconcilePlayback,1200);

      if(reduced){document.querySelectorAll('.metric-number').forEach(function(el){el.textContent=(el.dataset.prefix||'')+el.dataset.value+(el.dataset.suffix||'')})}
      else{
        var countObserver=new IntersectionObserver(function(entries,watcher){entries.forEach(function(entry){if(!entry.isIntersecting)return;var el=entry.target,end=parseFloat(el.dataset.value),prefix=el.dataset.prefix||'',suffix=el.dataset.suffix||'',start=performance.now();function frame(now){var p=Math.min(1,(now-start)/1200),ease=1-Math.pow(1-p,3),value=end%1?(end*ease).toFixed(2):Math.round(end*ease);el.textContent=prefix+value+suffix;if(p<1)requestAnimationFrame(frame)}requestAnimationFrame(frame);watcher.unobserve(el)})},{threshold:.5});
        document.querySelectorAll('.metric-number').forEach(function(el){countObserver.observe(el)});
      }
      if(anatomy){setStage(0);anatomyProgress();}
    }());
  