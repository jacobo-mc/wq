S = {};

S.channels = [];
S.static_channels = [];
S.ambient_channels = [];

S.UNSCHEDULED = 0
S.SCHEDULED = 1
S.PLAYING = 2
S.FINISHED = 3


S.listener_origin = [0.0, 0.0, 0.0];
S.listener_forward = [0.0, 0.0, 0.0];
S.listener_right = [0.0, 0.0, 0.0];
S.listener_up = [0.0, 0.0, 0.0];

S.known_sfx = [];
S.cloneNode = function(sfx, permanentNode) {
	//permanentNode = true
	//console.log('setup clone',sfx.name,sfx)
	var node = sfx.cache.data
	var aud = node.cloneNode();
	/*
	if (S.cache[sfx.name]) {
		S.cache[sfx.name].push()
	}*/
	aud.setAttribute('data-name',sfx.name)
	// i hate timeouts, but this seems to work
	if (! permanentNode) {
		var t = sfx.cache.length
		//console.log('remove',sfx.name,'in',t)
		setTimeout( function() {
			aud.src = ''
			aud.parentNode.removeChild(aud)
		},  t * 1000 + 30)
	}

	S.audioholder.appendChild(aud)
	return aud
}
S.Init = function()
{
	S.audioholder = document.getElementById('audioholder')
	Con.Print('\nSound Initialization\n');
	Cmd.AddCommand('play', S.Play);
	Cmd.AddCommand('playvol', S.PlayVol);
	Cmd.AddCommand('stopsound', S.StopAllSounds);
	Cmd.AddCommand('soundlist', S.SoundList);
	S.nosound = Cvar.RegisterVariable('nosound', (COM.CheckParm('-nosound') != null) ? '1' : '0');
	S.volume = Cvar.RegisterVariable('volume', '0.7', true);
	S.precache = Cvar.RegisterVariable('precache', '1');
	S.bgmvolume = Cvar.RegisterVariable('bgmvolume', '1', true);
	S.ambient_level = Cvar.RegisterVariable('ambient_level', '0.3');
	S.ambient_fade = Cvar.RegisterVariable('ambient_fade', '100');

	S.started = true;

	// createBuffer is broken, disable Web Audio for now.
	if (true) {
		if (window.AudioContext != null)
			S.context = new AudioContext();
		else if (window.webkitAudioContext != null)
			S.context = new webkitAudioContext();
	}

	var i, ambient_sfxs = ['water1', 'wind2'], ch, nodes, promises;
	
	promises = ambient_sfxs.map(function(ambient_sfx,i){
		return S.PrecacheSound('ambience/' + ambient_sfx + '.wav')
			.then(function(sound){
				ch = {sfx: sound, end: 0.0, master_vol: 0.0};
				S.ambient_channels[i] = ch;
				return COM.MaybePromise(S.LoadSound(ch.sfx), function(respin){
					return COM.MaybePromise( respin, function(resp) {
						//console.log('resp',ch,resp)
						if(!resp) {
							return;
						}
						if (ch.sfx.cache.loopstart == null)
						{
							Con.Print('Sound ambience/' + ch.sfx.name + '.wav not looped\n');
							return;
						}
						if (S.context != null)
						{
							nodes = {
								source: S.context.createBufferSource(),
								gain: S.context.createGain()
							};
							ch.nodes = nodes;
							nodes.source.playbackState = S.UNSCHEDULED
							nodes.source.onended = function(evt) {
								//console.log(ch.sfx.name,'ambience finish')
								nodes.source.playbackState = S.FINISHED
							}
							nodes.source.buffer = ch.sfx.cache.data;
							nodes.source.loop = true;
							nodes.source.loopStart = ch.sfx.cache.loopstart;
							nodes.source.loopEnd = nodes.source.buffer.length;
							nodes.source.connect(nodes.gain);
							nodes.gain.connect(S.context.destination);
							//console.log('created ambience',ch)
						}
						else
							//ch.audio = ch.sfx.cache.data.cloneNode();
							ch.audio = S.cloneNode(ch.sfx)
					})
				})
			});
	});
	
	promises.push(S.PrecacheSound('misc/talk.wav').then(function(sound){
		Con.sfx_talk = sound;
	}));
	
	return Promise.all(promises);
};

S.NoteOnMaybeCreate = function(sfx, node) {
	switch(node.playbackState) {
	case S.UNSCHEDULED:
	case S.SCHEDULED:
		node.start(0.0)
		node.playbackState = S.PLAYING
		break
	case S.PLAYING:
		debugger
		break;
	case S.FINISHED:
		break;
	}
}

S.NoteOff = function(sfx, node)
{
	if (node.playbackState === S.FINISHED) return
	if ((node.playbackState === S.SCHEDULED) || (node.playbackState === S.PLAYING))
	{
		try {
			//console.log(sfx&&sfx.name,'stop')
			node.stop(0.0);
			node.playbackState = S.FINISHED
			} catch (e) {}
	}
}

S.NoteOn = function(sfx, node)
{
	if (node.playbackState == S.FINISHED) {
		//console.log("ERROR cannot play audiosource more than once. clone it and play again?",sfx.name)
		debugger
		return
	} else if (node.playbackState == S.PLAYING) {
		//console.log('already palying...')
		debugger
	}
	
	if (node.playbackState === S.UNSCHEDULED)
	{
		try {
			//console.log(sfx&&sfx.name,'start')
			node.start(0.0);
			node.playbackState = S.PLAYING
			} catch (e) {}
	}
}

S.PrecacheSound = function(name)
{
	//console.log('precachesound')
	return new Promise(function(resolve,reject){
		if (S.nosound.value !== 0)
			return resolve();
		var i, sfx;
		for (i = 0; i < S.known_sfx.length; ++i)
		{
			if (S.known_sfx[i].name === name)
			{
				sfx = S.known_sfx[i];
				break;
			}
		}
		if (i === S.known_sfx.length)
		{
			S.known_sfx[i] = {name: name};
			sfx = S.known_sfx[i];
		}
		if (S.precache.value !== 0) {
			return COM.MaybePromise(S.LoadSound(sfx), function(){
				resolve(sfx);
			});
		} else {
			return resolve();
		}
	});
};

S.PickChannel = function(entnum, entchannel)
{
	var i, channel;

	if (entchannel !== 0)
	{
		for (i = 0; i < S.channels.length; ++i)
		{
			channel = S.channels[i];
			if (channel == null)
				continue;
			if ((channel.entnum === entnum) && ((channel.entchannel === entchannel) || (entchannel === -1)))
			{
				channel.sfx = null;
				if (channel.nodes != null)
				{
					S.NoteOff(channel.sfx, channel.nodes.source);
					channel.nodes = null;
				}
				else if (channel.audio != null)
				{
					channel.audio.pause();
					channel.audio = null;
				}
				break;
			}
		}
	}

	if ((entchannel === 0) || (i === S.channels.length))
	{
		for (i = 0; i < S.channels.length; ++i)
		{
			channel = S.channels[i];
			if (channel == null)
				break;
			if (channel.sfx == null)
				break;
		}
	}

	if (i === S.channels.length)
	{
		S.channels[i] = {end: 0.0};
		return S.channels[i];
	}
	return channel;
};

S.Spatialize = function(ch)
{
	if (ch.entnum === CL.state.viewentity)
	{
		ch.leftvol = ch.master_vol;
		ch.rightvol = ch.master_vol;
		return;
	}

	var source = [
		ch.origin[0] - S.listener_origin[0],
		ch.origin[1] - S.listener_origin[1],
		ch.origin[2] - S.listener_origin[2]
	];
	var dist = Math.sqrt(source[0] * source[0] + source[1] * source[1] + source[2] * source[2]);
	if (dist !== 0.0)
	{
		source[0] /= dist;
		source[1] /= dist;
		source[2] /= dist;
	}
	dist *= ch.dist_mult;
	var dot = S.listener_right[0] * source[0]
		+ S.listener_right[1] * source[1]
		+ S.listener_right[2] * source[2];

	ch.rightvol = ch.master_vol * (1.0 - dist) * (1.0 + dot);
	if (ch.rightvol < 0.0)
		ch.rightvol = 0.0;
	ch.leftvol = ch.master_vol * (1.0 - dist) * (1.0 - dot);
	if (ch.leftvol < 0.0)
		ch.leftvol = 0.0;
};

S.StartSound = function(entnum, entchannel, sfx, origin, vol, attenuation)
{
	if ((S.nosound.value !== 0) || (sfx == null)) {
		return Promise.resolve();
	}
	var target_chan = S.PickChannel(entnum, entchannel);
	target_chan.origin = [origin[0], origin[1], origin[2]];
	target_chan.dist_mult = attenuation * 0.001;
	target_chan.master_vol = vol;
	target_chan.entnum = entnum;
	target_chan.entchannel = entchannel;
	S.Spatialize(target_chan);
	if ((target_chan.leftvol === 0.0) && (target_chan.rightvol === 0.0))
		return Promise.resolve();
	//console.log('startsound',sfx.name,sfx.cache)
	return COM.MaybePromise(S.LoadSound(sfx), function(ret){
		if(!ret) {
			target_chan.sfx = null;
			return Promise.resolve();
		}
	
		target_chan.sfx = sfx;
		target_chan.pos = 0.0;
		target_chan.end = Host.realtime + sfx.cache.length;
		var volume;
		if (S.context != null)
		{
			var nodes = {
				source: S.context.createBufferSource(),
				merger1: S.context.createChannelMerger(2),
				splitter: S.context.createChannelSplitter(2),
				gain0: S.context.createGain(),
				gain1: S.context.createGain(),
				merger2: S.context.createChannelMerger(2)
			};
			nodes.source.playbackState = S.UNSCHEDULED
			nodes.source.onended = function(evt) {
				//console.log(sfx.name,'finish')
				nodes.source.playbackState = S.FINISHED
			}
			target_chan.nodes = nodes;
			nodes.source.buffer = sfx.cache.data;
			if (sfx.cache.loopstart != null)
			{
				//console.log('startsound looping',sfx.name)
				nodes.source.loop = true;
				nodes.source.loopStart = sfx.cache.loopstart;
				nodes.source.loopEnd = nodes.source.buffer.length;
			}
			nodes.source.connect(nodes.merger1);
			nodes.source.connect(nodes.merger1, 0, 1);
			nodes.merger1.connect(nodes.splitter);
			nodes.splitter.connect(nodes.gain0, 0);
			nodes.splitter.connect(nodes.gain1, 1);
			volume = target_chan.leftvol;
			if (volume > 1.0)
				volume = 1.0;
			nodes.gain0.gain.value = volume * S.volume.value;
			nodes.gain0.connect(nodes.merger2, 0, 0);
			volume = target_chan.rightvol;
			if (volume > 1.0)
				volume = 1.0;
			nodes.gain1.gain.value = volume * S.volume.value;
			nodes.gain1.connect(nodes.merger2, 0, 1);
			nodes.merger2.connect(S.context.destination);
			var i, check, skip;
			for (i = 0; i < S.channels.length; ++i)
			{
				check = S.channels[i];
				if (check === target_chan)
					continue;
				if ((check.sfx !== sfx) || (check.pos !== 0.0))
					continue;
				skip = Math.random() * 0.1;
				if (skip >= sfx.cache.length)
				{
					//console.log('noteon',sfx)
					S.NoteOn(sfx,nodes.source);
					break;
				}
				target_chan.pos += skip;
				target_chan.end -= skip;
				nodes.source.playbackState = S.SCHEDULED
				nodes.source.start(0.0, skip, nodes.source.buffer.length - skip);
				nodes.source.onended = function(evt) {
					//console.log(sfx.name,'finish')
					nodes.source.playbackState = S.FINISHED
				}
				break;
			}
			//console.log('noteon',sfx)
			S.NoteOn(sfx,nodes.source);
		}
		else
		{
			//target_chan.audio = sfx.cache.data.cloneNode();
			target_chan.audio = S.cloneNode(sfx)
			volume = (target_chan.leftvol + target_chan.rightvol) * 0.5;
			if (volume > 1.0)
				volume = 1.0;
			target_chan.audio.volume = volume * S.volume.value;
			target_chan.audio.play();
		}
		return Promise.resolve();
	});
};

S.StopSound = function(entnum, entchannel)
{
	if (S.nosound.value !== 0)
		return;
	var i, ch;
	for (i = 0; i < S.channels.length; ++i)
	{
		ch = S.channels[i];
		if (ch == null)
			continue;
		if ((ch.entnum === entnum) && (ch.entchannel === entchannel))
		{
			ch.end = 0.0;
			ch.sfx = null;
			if (ch.nodes != null)
			{
				S.NoteOff(ch.sfx, ch.nodes.source);
				ch.nodes = null;
			}
			else if (ch.audio != null)
			{
				ch.audio.pause();
				ch.audio = null;
			}
			return;
		}
	}
};

S.StopAllSounds = function()
{
	if (S.nosound.value !== 0)
		return;

	var i, ch;

	for (i = 0; i < S.ambient_channels.length; ++i)
	{
		ch = S.ambient_channels[i];
		ch.master_vol = 0.0;
		if (ch.nodes != null)
			S.NoteOff(ch.sfx, ch.nodes.source);
		else if (ch.audio != null)
			ch.audio.pause();
	}

	for (i = 0; i < S.channels.length; ++i)
	{
		ch = S.channels[i];
		if (ch == null)
			continue;
		if (ch.nodes != null)
			S.NoteOff(ch.sfx, ch.nodes.source);
		else if (ch.audio != null)
			ch.audio.pause();
	}
	S.channels = [];

	if (S.context != null)
	{
		for (i = 0; i < S.static_channels.length; ++i)
			S.NoteOff(ch.sfx, S.static_channels[i].nodes.source);
	}
	else
	{
		for (i = 0; i < S.static_channels.length; ++i)
			S.static_channels[i].audio.pause();
	}
	S.static_channels = [];
};

S.StaticSound = function(sfx, origin, vol, attenuation)
{
	return new Promise(function(resolve,reject) {
		if ((S.nosound.value !== 0) || (sfx == null)){
			resolve();
			return;
		}
		COM.MaybePromise(S.LoadSound(sfx), function(retin) {
			COM.MaybePromise(retin, function(ret) {
				//console.log('static ret',sfx,ret)
				if (ret !== true){
					return resolve();
				}
				if (sfx.cache.loopstart == null)
				{
					Con.Print('Sound ' + sfx.name + ' not looped\n');
					resolve();
				}
				var ss = {
					sfx: sfx,
					origin: [origin[0], origin[1], origin[2]],
					master_vol: vol,
					dist_mult: attenuation * 0.000015625,
					end: Host.realtime + sfx.cache.length
				};
				S.static_channels[S.static_channels.length] = ss;
				
				if (S.context != null)
				{
					S.createStaticNodes(sfx, ss)
				}
				else
				{
					//ss.audio = sfx.cache.data.cloneNode();
					ss.audio = S.cloneNode(sfx)
					ss.audio.pause();
				}
				resolve();
			})
		});
	});
};

S.createStaticNodes = function(sfx, ss) {
	var nodes = {
		source: S.context.createBufferSource(),
		merger1: S.context.createChannelMerger(2),
		splitter: S.context.createChannelSplitter(2),
		gain0: S.context.createGain(),
		gain1: S.context.createGain(),
		merger2: S.context.createChannelMerger(2)
	};
	nodes.source.playbackState = S.UNSCHEDULED
	nodes.source.onended = function(evt) {
		//console.log(sfx.name,'finish')
		nodes.source.playbackState = S.FINISHED
	}
	ss.nodes = nodes;
	nodes.source.buffer = sfx.cache.data;
	nodes.source.loop = true;
	nodes.source.loopStart = sfx.cache.loopstart;
	nodes.source.loopEnd = nodes.source.buffer.length;
	nodes.source.connect(nodes.merger1);
	nodes.source.connect(nodes.merger1, 0, 1);
	nodes.merger1.connect(nodes.splitter);
	nodes.splitter.connect(nodes.gain0, 0);
	nodes.splitter.connect(nodes.gain1, 1);
	nodes.gain0.connect(nodes.merger2, 0, 0);
	nodes.gain1.connect(nodes.merger2, 0, 1);
	nodes.merger2.connect(S.context.destination);
}

S.SoundList = function()
{
	var total = 0, i, sfx, sc, size;
	for (i = 0; i < S.known_sfx.length; ++i)
	{
		sfx = S.known_sfx[i];
		sc = sfx.cache;
		if (sc == null)
			continue;
		size = sc.size.toString();
		total += sc.size;
		for (; size.length <= 5; )
			size = ' ' + size;
		if (sc.loopstart != null)
			size = 'L' + size;
		else
			size = ' ' + size;
		Con.Print(size + ' : ' + sfx.name + '\n');
	}
	Con.Print('Total resident: ' + total + '\n');
};

S.LocalSound = function(sound)
{
	return S.StartSound(CL.state.viewentity, -1, sound, Vec.origin, 1.0, 1.0);
};

S.UpdateAmbientSounds = function()
{
	if (CL.state.worldmodel == null)
		return;

	var i, ch, vol, sc;

	var l = Mod.PointInLeaf(S.listener_origin, CL.state.worldmodel);
	if ((l == null) || (S.ambient_level.value === 0))
	{
		for (i = 0; i < S.ambient_channels.length; ++i)
		{
			ch = S.ambient_channels[i];
			ch.master_vol = 0.0;
			if (ch.nodes != null)
			{
				S.NoteOff(ch.sfx, ch.nodes.source);
			}
			else if (ch.audio != null)
			{
				if (ch.audio.paused !== true)
					ch.audio.pause();
			}
		}
		return;
	}

	for (i = 0; i < S.ambient_channels.length; ++i)
	{
		ch = S.ambient_channels[i];
		if ((ch.nodes == null) && (ch.audio == null))
			continue;
		vol = S.ambient_level.value * l.ambient_level[i];
		if (vol < 8.0)
			vol = 0.0;
		vol /= 255.0;
		if (ch.master_vol < vol)
		{
			ch.master_vol += (Host.frametime * S.ambient_fade.value) / 255.0;
			if (ch.master_vol > vol)
				ch.master_vol = vol;
		}
		else if (ch.master_vol > vol)
		{
			ch.master_vol -= (Host.frametime * S.ambient_fade.value) / 255.0;
			if (ch.master_vol < vol)
				ch.master_vol = vol;
		}

		if (ch.master_vol === 0.0)
		{
			if (S.context != null)
			{
				S.NoteOff(ch.sfx, ch.nodes.source);
			}
			else
			{
				if (ch.audio.paused !== true)
					ch.audio.pause();
			}
			continue;
		}
		if (ch.master_vol > 1.0)
			ch.master_vol = 1.0;
		if (S.context != null)
		{
			ch.nodes.gain.gain.value = ch.master_vol * S.volume.value;
			//console.log('ambient note on')
			if (ch.nodes.source.playbackState == S.UNSCHEDULED)
				S.NoteOn(ch.sfx, ch.nodes.source);
		}
		else
		{
			ch.audio.volume = ch.master_vol * S.volume.value;
			sc = ch.sfx.cache;
			if (ch.audio.paused === true)
			{
				ch.audio.play();
				ch.end = Host.realtime + sc.length;
				continue;
			}
			if (Host.realtime >= ch.end)
			{
				try
				{
					ch.audio.currentTime = sc.loopstart;
				}
				catch (e)
				{
					ch.end = Host.realtime;
					continue;
				}
				ch.end = Host.realtime + sc.length - sc.loopstart;
			}
		}
	}
};

S.UpdateDynamicSounds = function()
{
	var i, ch, sc, volume;
	for (i = 0; i < S.channels.length; ++i)
	{
		ch = S.channels[i];
		if (ch == null)
			continue;
		if (ch.sfx == null)
			continue;
		if (Host.realtime >= ch.end)
		{
			sc = ch.sfx.cache;
			if (sc.loopstart != null)
			{
				if (S.context == null)
				{
					try
					{
						ch.audio.currentTime = sc.loopstart;
					}
					catch (e)
					{
						ch.end = Host.realtime;
						continue;
					}
				}
				ch.end = Host.realtime + sc.length - sc.loopstart;
			}
			else
			{
				ch.sfx = null;
				ch.nodes = null;
				ch.audio = null;
				continue;
			}
		}
		S.Spatialize(ch);
		if (S.context != null)
		{
			if (ch.leftvol > 1.0)
				ch.leftvol = 1.0;
			if (ch.rightvol > 1.0)
				ch.rightvol = 1.0;
			ch.nodes.gain0.gain.volume = ch.leftvol * S.volume.value;
			ch.nodes.gain1.gain.volume = ch.rightvol * S.volume.value;
		}
		else
		{
			volume = (ch.leftvol + ch.rightvol) * 0.5;
			if (volume > 1.0)
				volume = 1.0;
			ch.audio.volume = volume * S.volume.value;
		}
	}
};

S.UpdateStaticSounds = function()
{
	var i, j, ch, ch2, sfx, sc, volume;

	for (i = 0; i < S.static_channels.length; ++i)
		S.Spatialize(S.static_channels[i]);

	for (i = 0; i < S.static_channels.length; ++i)
	{
		ch = S.static_channels[i];
		if ((ch.leftvol === 0.0) && (ch.rightvol === 0.0))
			continue;
		sfx = ch.sfx;
		for (j = i + 1; j < S.static_channels.length; ++j)
		{
			ch2 = S.static_channels[j];
			if (sfx === ch2.sfx)
			{
				ch.leftvol += ch2.leftvol;
				ch.rightvol += ch2.rightvol;
				ch2.leftvol = 0.0;
				ch2.rightvol = 0.0;
			}
		}
	}

	if (S.context != null)
	{
		for (i = 0; i < S.static_channels.length; ++i)
		{
			ch = S.static_channels[i];
			if ((ch.leftvol === 0.0) && (ch.rightvol === 0.0))
			{
				if (ch.nodes.source.playbackState == S.PLAYING) {
					//console.log(Host.framecount,'closing static',ch.sfx.name,ch.origin)
					S.NoteOff(ch.sfx, ch.nodes.source);
				}
				continue;
			}
			if (ch.leftvol > 1.0)
				ch.leftvol = 1.0;
			if (ch.rightvol > 1.0)
				ch.rightvol = 1.0;
			ch.nodes.gain0.gain.value = ch.leftvol * S.volume.value;
			ch.nodes.gain1.gain.value = ch.rightvol * S.volume.value;
			//
			//console.log('updatestatic on',sfx.name)
			if (ch.nodes.source.playbackState == S.FINISHED) {
				// EH?? no ?....
				ch.nodes = null
				//console.log(Host.framecount,'creating new static nodes',ch.sfx.name,ch.origin) // this is making a latency/blip
				// NEEDS TO CREATE WITH CORRECT VOLUME!!!
				S.createStaticNodes(ch.sfx, ch)
				ch.nodes.gain0.gain.value = ch.leftvol * S.volume.value;
				ch.nodes.gain1.gain.value = ch.rightvol * S.volume.value;
				S.NoteOn(ch.sfx, ch.nodes.source)
			} else if (ch.nodes.source.playbackState == S.PLAYING) {
				// all good
			} else if (ch.nodes.source.playbackState == S.UNSCHEDULED) {
				//console.log(Host.framecount,"starting unscheduled static",ch.sfx.name, ch.origin, 'loop?',ch.nodes.source.loop)
				S.NoteOn(ch.sfx, ch.nodes.source); // this is failing because it already played... XXX
			} else {
				debugger
			}
		}
	}
	else
	{
		for (i = 0; i < S.static_channels.length; ++i)
		{
			ch = S.static_channels[i];
			volume = (ch.leftvol + ch.rightvol) * 0.5;
			if (volume > 1.0)
				volume = 1.0;
			if (volume === 0.0)
			{
				if (ch.audio.paused !== true)
					ch.audio.pause();
				continue;
			}
			ch.audio.volume = volume * S.volume.value;
			sc = ch.sfx.cache;
			if (ch.audio.paused === true)
			{
				ch.audio.play();
				ch.end = Host.realtime + sc.length;
				continue;
			}
			if (Host.realtime >= ch.end)
			{
				try
				{
					ch.audio.currentTime = sc.loopstart;
				}
				catch (e)
				{
					ch.end = Host.realtime;
					continue;
				}
			}
		}
	}
};

S.Update = function(origin, forward, right, up)
{
	if (S.nosound.value !== 0)
		return;

	S.listener_origin[0] = origin[0];
	S.listener_origin[1] = origin[1];
	S.listener_origin[2] = origin[2];
	S.listener_forward[0] = forward[0];
	S.listener_forward[1] = forward[1];
	S.listener_forward[2] = forward[2];
	S.listener_right[0] = right[0];
	S.listener_right[1] = right[1];
	S.listener_right[2] = right[2];
	S.listener_up[0] = up[0];
	S.listener_up[1] = up[1];
	S.listener_up[2] = up[2];

	if (S.volume.value < 0.0)
		Cvar.SetValue('volume', 0.0);
	else if (S.volume.value > 1.0)
		Cvar.SetValue('volume', 1.0);

	S.UpdateAmbientSounds();
	S.UpdateDynamicSounds();
	S.UpdateStaticSounds();
};

S.Play = function()
{
	if (S.nosound.value !== 0)
		return Promise.resolve();
	var i = 1;
	function playSound() {
		if(i++ < Cmd.argv.length-1){
			return S.PrecacheSound(COM.DefaultExtension(Cmd.argv[i], '.wav'))
				.then(function(sfx){
					if(sfx != null) {
						return S.StartSound(CL.state.viewentity, 0, sfx, S.listener_origin, 1.0, 1.0)
							.then(playSound);
					}
					return playSound();
				})
			
		} else {
			return Promise.resolve();
		}
	}
	
	return playSound();
};

S.PlayVol = function()
{
	if (S.nosound.value !== 0)
		return Promise.resolve();
	var i,j = 1;
	function playVol(){
		if(j < Cmd.argv.length){
			i = j;
			j += 2;
			return S.PrecacheSound(COM.DefaultExtension(Cmd.argv[i], '.wav'))
				.then(function(sfx){
					if(sfx != null) {
						return S.StartSound(CL.state.viewentity, 0, sfx, S.listener_origin, Q.atof(Cmd.argv[i + 1]), 1.0)
							.then(playSound);
					}
					return playSound();
				})
		} else {
			return Promise.resolve();
		}
	}
	return playVol();
};

S.LoadSound = function(s)
{
	//console.log('loadsound',s)
	if (S.nosound.value !== 0)
		return;
	if (s.cache != null)
		return true;

	var sc = {};

	return COM.LoadFile('sound/' + s.name)
		.then(function(data){
			if (data == null)
			{
				Con.Print('Couldn\'t load sound/' + s.name + '\n');
				return false;
			}
		
			var view = new DataView(data);
			if ((view.getUint32(0, true) !== 0x46464952) || (view.getUint32(8, true) !== 0x45564157))
			{
				Con.Print('Missing RIFF/WAVE chunks\n');
				return false;
			}
			var p, fmt, dataofs, datalen, cue, loopstart, samples;
			for (p = 12; p < data.byteLength; )
			{
				switch (view.getUint32(p, true))
				{
				case 0x20746d66: // fmt
					if (view.getInt16(p + 8, true) !== 1)
					{
						Con.Print('Microsoft PCM format only\n');
						return false;
					}
					fmt = {
						channels: view.getUint16(p + 10, true),
						samplesPerSec: view.getUint32(p + 12, true),
						avgBytesPerSec: view.getUint32(p + 16, true),
						blockAlign: view.getUint16(p + 20, true),
						bitsPerSample: view.getUint16(p + 22, true)
					};
					break;
				case 0x61746164: // data
					dataofs = p + 8;
					datalen = view.getUint32(p + 4, true);
					break;
				case 0x20657563: // cue
					cue = true;
					loopstart = view.getUint32(p + 32, true);
					break;
				case 0x5453494c: // LIST
					if (cue !== true)
						break;
					cue = false;
					if (view.getUint32(p + 28, true) === 0x6b72616d)
						samples = loopstart + view.getUint32(p + 24, true);
					break;
				}
				p += view.getUint32(p + 4, true) + 8;
				if ((p & 1) !== 0)
					++p;
			}
		
			if (fmt == null)
			{
				Con.Print('Missing fmt chunk\n');
				return false;
			}
			if (dataofs == null)
			{
				Con.Print('Missing data chunk\n');
				return false;
			}
			if (loopstart != null)
				sc.loopstart = loopstart * fmt.blockAlign / fmt.samplesPerSec;
			if (samples != null)
				sc.length = samples / fmt.samplesPerSec;
			else
				sc.length = datalen / fmt.avgBytesPerSec;
		
			sc.size = datalen + 44;
			if ((sc.size & 1) !== 0)
				++sc.size;
			var out = new ArrayBuffer(sc.size);
			view = new DataView(out);
			view.setUint32(0, 0x46464952, true); // RIFF
			view.setUint32(4, sc.size - 8, true);
			view.setUint32(8, 0x45564157, true); // WAVE
			view.setUint32(12, 0x20746d66, true); // fmt
			view.setUint32(16, 16, true);
			view.setUint16(20, 1, true);
			view.setUint16(22, fmt.channels, true);
			view.setUint32(24, fmt.samplesPerSec, true);
			view.setUint32(28, fmt.avgBytesPerSec, true);
			view.setUint16(32, fmt.blockAlign, true);
			view.setUint16(34, fmt.bitsPerSample, true);
			view.setUint32(36, 0x61746164, true); // data
			view.setUint32(40, datalen, true);
			(new Uint8Array(out, 44, datalen)).set(new Uint8Array(data, dataofs, datalen));
			if (S.context != null) {
				//sc.data = S.context.createBuffer(out, true);
				//console.log('creating decode promise', sc)
				return new Promise(function(resolve,reject) {
					//console.log('decoding audio data', s.name, sc)
					S.context.decodeAudioData(out, function(buf) {
						//console.log('decoded audio data',s.name, sc)
						sc.data = buf
						s.cache = sc
						resolve(true)
					}, function(err) {
						reject(err)
					})
				})
			} else {
				sc.data = new Audio('data:audio/wav;base64,' + Q.btoa(new Uint8Array(out)));
				s.cache = sc;
			}

			return true;
		});
};
