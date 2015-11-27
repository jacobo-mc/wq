Store = (function(){
	var dbName = 'quakeAssets',
		storeName = 'pak',
		dbVersion = 3;
	window.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
	function verifyOpen(){
		return new Promise(function(resolve, reject){
			var openReq = indexedDB.open(dbName, dbVersion);
			openReq.onupgradeneeded = function(event){
				db = event.target.result;
				try{
					// Create an objectStore for this database
					db.createObjectStore(storeName, { keyPath: "pakName" });	
				}catch(e) {
					console.log("on Creating object store: " + e)
				}
			};
			openReq.onerror = function(event) {
				alert("Why didn't you allow my web app to use IndexedDB?!");
				reject();
			};
			openReq.onsuccess = function(event){
				resolve(event.target.result);
			};
		});
	}
	function getPak(name) {
		return function(db){
			return new Promise(function(resolve, reject) {
				try {
					var store = db.transaction([storeName], 'readwrite').objectStore(storeName);
					
					request = store.get(name);
						
					request.onerror = function(e) {
						console.log(e);
						reject(e);
					};
					request.onsuccess = function(event) {
						console.log('Successfully retrieved blob');
						resolve(request.result);
					};
				} catch (e) {
					console.log("what the f?" + e)
					reject(e);
				}
			});
		};
	}
	function savePak(name, blob) {
		return function(db) {
			return new Promise(function(resolve, reject) {
				try {
					var store = db.transaction(['pak'], 'readwrite').objectStore('pak');
					
					request = store.add({
						pakName: name,
						data: blob});
						
					request.onerror = function(e) {
						console.log(e);
						reject(e);
					};
					request.onsuccess = function(event) {
						console.log('Successfully saved blob');
						resolve();
					};
				} catch (e) {
					console.log("what the f?" + e)
					reject(e);
				}
			});
		}
	}
	return {
		get: function(pakName){
			return verifyOpen()
				.then(getPak(name))
		},
		set: function(pakName, blob){
			return verifyOpen()
				.then(savePak(name, blob));
		}
	};
}());