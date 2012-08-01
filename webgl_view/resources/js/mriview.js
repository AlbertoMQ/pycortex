var flatscale = .4;

var vShadeHead = [
    "attribute vec2 datamap;",
    "uniform sampler2D data[4];",
    "uniform vec2 datasize;",

    "uniform sampler2D colormap;",
    "uniform float vmin[2];",
    "uniform float vmax[2];",

    "uniform float framemix;",

    "varying vec3 vViewPosition;",
    "varying vec3 vNormal;",
    "varying vec4 vColor;",

    THREE.ShaderChunk[ "map_pars_vertex" ], 
    THREE.ShaderChunk[ "lights_phong_pars_vertex" ],
    THREE.ShaderChunk[ "morphtarget_pars_vertex" ],

    "void main() {",

        "vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",

        THREE.ShaderChunk[ "map_vertex" ],
        
        "vec2 dcoord = (2.*datamap+1.) / (2.*datasize);",
        "",
].join("\n");

var vShadeTail = [ "",
        "vViewPosition = -mvPosition.xyz;",

        THREE.ShaderChunk[ "morphnormal_vertex" ],

        "vNormal = transformedNormal;",

        THREE.ShaderChunk[ "lights_phong_vertex" ],
        THREE.ShaderChunk[ "morphtarget_vertex" ],
        THREE.ShaderChunk[ "default_vertex" ],

    "}"

].join("\n");

var cmapShader = vShadeHead + ([
        "float vdata0 = texture2D(data[0], dcoord).r;",
        "float vdata1 = texture2D(data[1], dcoord).r;",
        "float vdata2 = texture2D(data[2], dcoord).r;",
        "float vdata3 = texture2D(data[3], dcoord).r;",

        "float vnorm0 = (vdata0 - vmin[0]) / (vmax[0] - vmin[0]);",
        "float vnorm1 = (vdata1 - vmin[1]) / (vmax[1] - vmin[1]);",
        "float vnorm2 = (vdata2 - vmin[0]) / (vmax[0] - vmin[0]);",
        "float vnorm3 = (vdata3 - vmin[1]) / (vmax[1] - vmin[1]);",

        "vec2 cuv0 = vec2(clamp(vnorm0, 0., .999), clamp(vnorm1, 0., .999) );",
        "vec2 cuv1 = vec2(clamp(vnorm2, 0., .999), clamp(vnorm3, 0., .999) );",

        "vColor  = (1. - framemix) * texture2D(colormap, cuv0);",
        "vColor +=       framemix  * texture2D(colormap, cuv1);",
].join("\n")) + vShadeTail;

var rawShader = vShadeHead + ([
        "vColor  = (1. - framemix) * texture2D(data[0], dcoord);",
        "vColor +=       framemix  * texture2D(data[2], dcoord);",
].join("\n")) + vShadeTail;

var fragmentShader = [
    "uniform sampler2D hatch;",

    "uniform vec3 diffuse;",
    "uniform vec3 ambient;",
    "uniform vec3 emissive;",
    "uniform vec3 specular;",
    "uniform float shininess;",

    "varying vec4 vColor;",
    THREE.ShaderChunk[ "map_pars_fragment" ],
    THREE.ShaderChunk[ "lights_phong_pars_fragment" ],

    "void main() {",
        "vec4 mapcolor = texture2D(map, vUv);",
        "gl_FragColor.a = mapcolor.a + vColor.a*(1.-mapcolor.a);",
        "gl_FragColor.rgb = mapcolor.rgb*mapcolor.a + vColor.rgb*vColor.a*(1.-mapcolor.a);",
        "gl_FragColor.rgb /= gl_FragColor.a;",

        THREE.ShaderChunk[ "lights_phong_fragment" ],
    "}"

].join("\n");

var flatVertShade = [
    "varying vec3 vColor;",
    "attribute float idx;",
    THREE.ShaderChunk[ "morphtarget_pars_vertex" ],
    "void main() {",
        "vColor.r = floor(idx / (256. * 256.)) / 255.;",
        "vColor.g = mod(idx / 256., 256.) / 255.;",
        "vColor.b = mod(idx, 256.) / 255.;",
        THREE.ShaderChunk[ "morphtarget_vertex" ],
        THREE.ShaderChunk[ "default_vertex" ],
    "}",
].join("\n");

var flatFragShade = [
    "varying vec3 vColor;",
    "void main() {",
        "gl_FragColor = vec4(vColor, 1.);",
    "}"
].join("\n");

function MRIview() { 
    // scene and camera
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera( 60, window.innerWidth / (window.innerHeight), 0.1, 5000 );
    this.camera.position.set(200, 200, 200);
    this.camera.up.set(0,0,1);

    this.scene.add( this.camera );
    this.controls = new THREE.LandscapeControls( this.scene, this.camera );
    
    this.light = new THREE.DirectionalLight( 0xffffff );
    this.light.position.set( -200, -200, 1000 ).normalize();
    this.camera.add( this.light );
    this.flatmix = 0;

    // renderer
    this.renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        preserveDrawingBuffer:true, 
        canvas:$("#brain")[0] 
    });
    this.renderer.setClearColorHex( 0x0, 1 );
    this.renderer.setSize( window.innerWidth,window.innerHeight);
    this.state = "pause";

    var uniforms = THREE.UniformsUtils.merge( [
        THREE.UniformsLib[ "lights" ],
        {
            diffuse:    { type:'v3', value:new THREE.Vector3( 1,1,1 )},
            specular:   { type:'v3', value:new THREE.Vector3( 1,1,1 )},
            emissive:   { type:'v3', value:new THREE.Vector3( 0,0,0 )},
            shininess:  { type:'f',  value:200},

            framemix:   { type:'f',  value:0},
            datasize:   { type:'v2', value:new THREE.Vector2(256, 0)},
            offsetRepeat:{type:'v4', value:new THREE.Vector4( 0, 0, 1, 1 ) },
            hatchrep:   { type:'v2', value:new THREE.Vector4(270, 100) },

            map:        { type:'t',  value:0, texture: null },
            hatch:      { type:'t',  value:1, texture: null },
            colormap:   { type:'t',  value:2, texture: null },
            data:       { type:'tv', value:3, texture: [null, null, null, null] },

            vmin:       { type:'fv1',value:[0,0]},
            vmax:       { type:'fv1',value:[1,1]},
        }
    ])

    this.shader =  this.cmapshader = new THREE.ShaderMaterial( { 
        vertexShader:cmapShader,
        fragmentShader:fragmentShader,
        uniforms: uniforms,
        attributes: { datamap:true },
        morphTargets:true, 
        morphNormals:true, 
        lights:true, 
        vertexColors:true,
    });
    this.shader.map = true;
    this.shader.metal = true;
    this.shader.needsUpdate = true;

    this.rawshader = new THREE.ShaderMaterial( {
        vertexShader:rawShader,
        fragmentShader:fragmentShader,
        uniforms: THREE.UniformsUtils.clone(uniforms),
        attributes: { datamap:true },
        morphTargets:true,
        morphNormals:true,
        lights:true,
        vertexColors:true,
    });
    this.rawshader.map = true;
    this.rawshader.metal = true;
    this.rawshader.needsUpdate = true;

    this.projector = new THREE.Projector();
    this._startplay = null;
    
    this._bindUI();
}
MRIview.prototype = { 
    draw: function () {
        this.controls.update(this.flatmix);
        this.renderer.render( this.scene, this.camera );
        if (this.roipack)
            this.roipack.move(this);
        if (this.state == "play") {
            var sec = ((new Date()) - this._startplay) / 1000;
            this.setFrame(sec % this.dataset.textures.length);
            requestAnimationFrame(this.draw.bind(this));
        }
        this._scheduled = false;
    },

    load: function(ctminfo) {
        if (this.meshes) {
            for (var hemi in this.meshes) {
                this.scene.remove(this.meshes[hemi]);
                delete this.meshes[hemi];
            }
            delete this.meshes;
        }
        
        var loader = new THREE.CTMLoader(true);
        $("#threeDview").append(loader.statusDomElement);
        loader.loadParts( ctminfo, function( geometries, materials, header, json ) {
            var rawdata = new Uint32Array(header.length / 4);
            var charview = new Uint8Array(rawdata.buffer);
            for (var i = 0, il = header.length; i < il; i++) {
                charview[i] = header.charCodeAt(i);
            }

            var polyfilt = {};
            polyfilt.left = rawdata.subarray(2, rawdata[0]+2);
            polyfilt.right = rawdata.subarray(rawdata[0]+2);

            geometries[0].computeBoundingBox();
            geometries[1].computeBoundingBox();

            this.meshes = {};
            this.pivot = {};
            this.datamap = {};
            this.polys = { norm:{}, flat:{}}
            this.flatlims = json.flatlims;
            this.flatoff = [
                Math.max(
                    Math.abs(geometries[0].boundingBox.min.x),
                    Math.abs(geometries[1].boundingBox.max.x)
                ) / 3, Math.min(
                    geometries[0].boundingBox.min.y, 
                    geometries[1].boundingBox.min.y
                )];
            var names = {left:0, right:1};

            $.get(loader.extractUrlBase(ctminfo)+json.rois, null, function(svgdoc) {
                this.roipack = new ROIpack(svgdoc, function(tex) {
                    this.shader.uniforms.map.texture = tex;
                    this.controls.dispatchEvent({type:"change"});
                }.bind(this));
                this.roipack.update(this.renderer);
            }.bind(this));
            for (var name in names) {
                var right = names[name];
                this.datamap[name] = geometries[right].attributes.datamap.array;
                this._makeFlat(geometries[right], polyfilt[name], right);
                var meshpiv = this._makeMesh(geometries[right], this.shader);
                this.meshes[name] = meshpiv.mesh;
                this.pivot[name] = meshpiv.pivots;
                this.scene.add(meshpiv.pivots.front);

                this.polys.norm[name] =  geometries[right].attributes.index;
                this.polys.flat[name] = geometries[right].attributes.flatindex;
            }
            this.controls.picker = new FacePick(this);
            this.controls.addEventListener("change", function() {
                if (!this._scheduled && this.state == "pause") {
                    this._scheduled = true;
                    requestAnimationFrame( this.draw.bind(this) );
                }
            }.bind(this));
            this.draw();
            $("#brain").css("opacity", 1);
        }.bind(this), true, true );
    },
    resize: function(width, height) {
        var w = width === undefined ? window.innerWidth : width;
        var h = height === undefined ? window.innerHeight : height;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.controls.resize(w, h);
        this.camera.updateProjectionMatrix();
        this.controls.dispatchEvent({type:"change"});
    },
    screenshot: function(width, height, callback) {
        $("#brain").css("opacity", 0);
        setTimeout(function() {
            if (typeof(callback) == "function")
                callback();
            this.resize(width, height);
            this.draw();
            window.location.href = $("#brain")[0].toDataURL().replace('image/png', 'image/octet-stream');
            this.resize();
            $("#brain").css("opacity", 1);
        }.bind(this), 1000);
    },
    reset_view: function(center, height) {
        var flatasp = this.flatlims[1][0] / this.flatlims[1][1];
        var camasp = height ? flatasp : this.camera.aspect;
        var size = [flatscale*this.flatlims[1][0], flatscale*this.flatlims[1][1]];
        var min = [flatscale*this.flatlims[0][0], flatscale*this.flatlims[0][1]];
        var xoff = center ? 0 : size[0] / 2 - min[0];
        var zoff = center ? 0 : size[1] / 2 - min[1];
        var h = size[0] / 2 / camasp;
        h /= Math.tan(this.camera.fov / 2 * Math.PI / 180);
        this.controls.target.set(xoff, this.flatoff[1], zoff);
        this.controls.set(180, 90, h);
        this.setMix(1);
    },
    saveflat: function(height) {
        var flatasp = this.flatlims[1][0] / this.flatlims[1][1];
        var width = height * flatasp;
        this.screenshot(width, height, function() { 
            this.reset_view(false, height); 
        }.bind(this));
    }, 
    setMix: function(val) {
        var num = this.meshes.left.geometry.morphTargets.length;
        var flat = num - 1;
        var n1 = Math.floor(val * num)-1;
        var n2 = Math.ceil(val * num)-1;

        for (var h in this.meshes) {
            var hemi = this.meshes[h];
            
            for (var i=0; i < num; i++) {
                hemi.morphTargetInfluences[i] = 0;
            }

            if ((this.lastn2 == flat) ^ (n2 == flat)) {
                this.setPoly(n2 == flat ? "flat" : "norm");
            }

            hemi.morphTargetInfluences[n2] = (val * num)%1;
            if (n1 >= 0)
                hemi.morphTargetInfluences[n1] = 1 - (val * num)%1;
        }
        this.flatmix = n2 == flat ? (val*num-.000001)%1 : 0;
        this.setPivot(this.flatmix*180);
        this.shader.uniforms.specular.value.set(1-this.flatmix, 1-this.flatmix, 1-this.flatmix);
        this.lastn2 = n2;
        this.controls.setCamera(this.flatmix);
        $("#mix").slider("value", val);
        this.controls.dispatchEvent({type:"change"});
    }, 
    setPivot: function (val) {
        $("#pivot").slider("option", "value", val);
        var names = {left:1, right:-1}
        if (val > 0) {
            for (var name in names) {
                this.pivot[name].front.rotation.z = 0;
                this.pivot[name].back.rotation.z = val*Math.PI/180 * names[name]/ 2;
            }
        } else {
            for (var name in names) {
                this.pivot[name].back.rotation.z = 0;
                this.pivot[name].front.rotation.z = val*Math.PI/180 * names[name] / 2;
            }
        }
        this.controls.dispatchEvent({type:"change"});
    },
    setPoly: function(polyvar) {
        for (var name in this.meshes) {
            this.meshes[name].geometry.attributes.index = this.polys[polyvar][name];
            this.meshes[name].geometry.offsets[0].count = this.polys[polyvar][name].numItems;
        }
        this.controls.dispatchEvent({type:"change"});
    },
    setData: function(dataset) {
        if (!(dataset instanceof Dataset))
            dataset = new Dataset(dataset);

        if (dataset.raw) {
            this.shader = this.rawshader;
            if (this.meshes && this.meshes.left) {
                this.meshes.left.material = this.rawshader;
                this.meshes.right.material = this.rawshader;
            }
        } else {
            this.shader = this.cmapshader;
            if (this.meshes && this.meshes.left) {
                this.meshes.left.material = this.cmapshader;
                this.meshes.right.material = this.cmapshader;
            }
        }
        this.shader.uniforms.datasize.value = dataset.datasize;
        this.dataset = dataset;
        if (dataset.textures.length > 1) {
            this.setFrame(0);
            $("#moviecontrols").show();
            $("#bottombar").addClass(".bbar_controls");
        } else {
            this.shader.uniforms.data.texture[0] = dataset.textures[0];
            $("#moviecontrols").hide();
            $("#bottombar").removeClass(".bbar_controls");
        }
        $("#vrange").slider("option", {min: dataset.min, max:dataset.max});
        this.setVminmax(dataset.min, dataset.max);
        this.controls.dispatchEvent({type:"change"});
    },

    setColormap: function(cmap) {
        var tex = new THREE.Texture(cmap);
        tex.needsUpdate = true;
        tex.flipY = false;
        this.shader.uniforms.colormap.texture = tex;
        this.controls.dispatchEvent({type:"change"});
    },

    setVminmax: function(vmin, vmax) {
        this.shader.uniforms.vmin.value[0] = vmin;
        this.shader.uniforms.vmax.value[0] = vmax;
        if (vmax > $("#vrange").slider("option", "max")) {
            $("#vrange").slider("option", "max", vmin);
        } else if (vmin < $("#vrange").slider("option", "min")) {
            $("#vrange").slider("option", "min", vmax);
        }
        $("#vrange").slider("option", "values", [vmin, vmax]);
        $("#vmin").val(vmin);
        $("#vmax").val(vmax);

        this.controls.dispatchEvent({type:"change"});
    },

    setFrame: function(frame) {
        this.shader.uniforms.data.texture[0] = this.dataset.textures[Math.floor(frame)];
        this.shader.uniforms.data.texture[2] = this.dataset.textures[Math.floor(frame)+1];
        this.shader.uniforms.framemix.value = frame - Math.floor(frame);
        this.controls.dispatchEvent({type:"change"});
    },
    playpause: function() {
        if (this.state == "pause") {
            this._startplay = new Date();
            this.controls.dispatchEvent({type:"change"});
            this.state = "play";
        } else {
            this.state = "pause";
        }
    },
    get_pos: function(idx) {
        //Returns the 2D screen coordinate of the given point index

        //Which hemi is the point on?
        var leftlen = this.meshes.left.geometry.attributes.position.array.length / 3;
        var name = idx < leftlen ? "left" : "right";
        if (idx >= leftlen)
            idx -= leftlen;
        var hemi = this.meshes[name].geometry;
        var influ = this.meshes[name].morphTargetInfluences;

        var basepos = new THREE.Vector3(
            hemi.attributes.position.array[idx*3+0],
            hemi.attributes.position.array[idx*3+1],
            hemi.attributes.position.array[idx*3+2]
        );
        var basenorm = new THREE.Vector3(
            hemi.attributes.normal.array[idx*3+0],
            hemi.attributes.normal.array[idx*3+1],
            hemi.attributes.normal.array[idx*3+2]
        );

        var isum = 0;
        var mpos = new THREE.Vector3(0,0,0);
        var mnorm = new THREE.Vector3(0,0,0);
        for (var i = 0, il = hemi.morphTargets.length; i < il; i++) {
            isum += influ[i];
            var mt = hemi.morphTargets[i];
            var mn = hemi.morphNormals[i];
            var pos = new THREE.Vector3(
                mt.array[mt.stride*idx+0],
                mt.array[mt.stride*idx+1],
                mt.array[mt.stride*idx+2]
            );
            var norm = new THREE.Vector3(mn[3*idx], mn[3*idx+1], mn[3*idx+2]);
            pos.multiplyScalar(influ[i]);
            norm.multiplyScalar(influ[i]);
            mpos.addSelf(pos);
            mnorm.addSelf(norm);
        }
        
        var pos = basepos.multiplyScalar(1-isum).addSelf(mpos);
        var norm = basenorm.multiplyScalar(1-isum).addSelf(mnorm);

        pos = this.meshes[name].matrix.multiplyVector3(pos);
        pos = this.pivot[name].back.matrix.multiplyVector3(pos);
        pos = this.pivot[name].front.matrix.multiplyVector3(pos);
        norm = this.meshes[name].matrix.multiplyVector3(norm);
        norm = this.pivot[name].back.matrix.multiplyVector3(norm);
        norm = this.pivot[name].front.matrix.multiplyVector3(norm);

        var cpos = this.camera.position.clone().subSelf(pos).normalize();
        var dot = norm.subSelf(pos).normalize().dot(cpos);

        var spos = this.projector.projectVector(pos, this.camera);
        var w = this.renderer.domElement.width;
        var h = this.renderer.domElement.height;
        var x = (spos.x + 1) / 2 * w;
        var y = h - (spos.y + 1) / 2 * h;

        return [[x, y], dot];
    },

    _bindUI: function() {
        $(window).resize(function() { this.resize(); }.bind(this));
        var _this = this;
        $("#mix").slider({
            min:0, max:1, step:.001,
            slide: function(event, ui) { this.setMix(ui.value); }.bind(this)
        });
        $("#pivot").slider({
            min:-180, max:180, step:.01,
            slide: function(event, ui) { this.setPivot(ui.value); }.bind(this)
        });
        $("#vrange").slider({ 
            range:true, width:200, min:0, max:1, step:.001, values:[0,1],
            slide: function(event, ui) { this.setVminmax(ui.values[0], ui.values[1]); }.bind(this)
        });
        $("#vmin").change(function() { this.setVminmax(parseInt($("#vmin").val()), parseInt($("#vmax").val())); }.bind(this));
        $("#vmax").change(function() { this.setVminmax(parseInt($("#vmin").val()), parseInt($("#vmax").val())); }.bind(this));
        $("#roi_linewidth").slider({
            min:.5, max:10, step:.1, value:3,
            change: this._updateROIs.bind(this),
        });
        $("#roi_linealpha").slider({
            min:0, max:1, step:.001, value:1,
            change: this._updateROIs.bind(this),
        });
        $("#roi_fillalpha").slider({
            min:0, max:1, step:.001, value:0,
            change: this._updateROIs.bind(this),
        });
        $("#roi_shadowalpha").slider({
            min:0, max:20, step:1, value:4,
            change: this._updateROIs.bind(this),
        });
        $("#roi_linecolor").miniColors({close: this._updateROIs.bind(this)});
        $("#roi_fillcolor").miniColors({close: this._updateROIs.bind(this)});
        $("#roi_shadowcolor").miniColors({close: this._updateROIs.bind(this)});

        var blanktex = new THREE.DataTexture(new Uint8Array(16*16*4), 16, 16);
        blanktex.needsUpdate = true;
        var _this = this;
        $("#roishow").change(function() {
            if (this.checked) 
                _this._updateROIs();
            else {
                _this.shader.uniforms.map.texture = blanktex;
                _this.controls.dispatchEvent({type:"change"});
            }
        })

        $("#colormap").ddslick({ width:296, height:400, 
            onSelected: function() { 
                setTimeout(function() {
                    this.setColormap($("#colormap .dd-selected-image")[0]);
                }.bind(this), 5);
            }.bind(this)
        });
        this.setColormap($("#colormap .dd-selected-image")[0]);
    },

    _makeFlat: function(geom, polyfilt, right) {
        geom.computeBoundingSphere();
        geom.dynamic = true;
        
        var fmin = this.flatlims[0], fmax = this.flatlims[1];
        var uv = geom.attributes.uv.array;
        var flat = new Float32Array(uv.length / 2 * 3);
        var norms = new Float32Array(uv.length / 2 * 3);
        for (var i = 0, il = uv.length / 2; i < il; i++) {
            if (!right) {
                //flat[i*3] = -this.flatoff[0];
                flat[i*3+1] = flatscale * -uv[i*2] + this.flatoff[1];
                norms[i*3] = -1;
            } else {
                //flat[i*3] = this.flatoff[0];
                flat[i*3+1] = flatscale*uv[i*2] + this.flatoff[1];
                norms[i*3] = 1;
            }
            flat[i*3+2] = flatscale*uv[i*2+1];
            uv[i*2]   = (uv[i*2]   + fmin[0]) / fmax[0];
            uv[i*2+1] = (uv[i*2+1] + fmin[1]) / fmax[1];
        }
        geom.morphTargets.push({ array:flat, stride:3 })
        geom.morphNormals.push( norms );

        //Make the triangle indicies with cuts
        var polys = new Uint16Array(geom.attributes.index.array.length - polyfilt.length*3);
        var j = 0;
        for (var i = 0, il = geom.attributes.index.array.length / 3; i < il; i++) {
            if (i != polyfilt[i-j]) {
                polys[j*3]   = geom.attributes.index.array[i*3];
                polys[j*3+1] = geom.attributes.index.array[i*3+1];
                polys[j*3+2] = geom.attributes.index.array[i*3+2];
                j++;
            }
        }

        geom.attributes.flatindex = {itemsize:1, array:polys, numItems:polys.length, stride:1};

        var voxidx = new Uint8Array(uv.length / 2 * 3);
        for (var i = 0, il = uv.length / 2; i < il; i ++) {
            voxidx[i*3+0] = Math.floor(i / (256*256));
            voxidx[i*3+1] = Math.floor(i / 256);
            voxidx[i*3+2] = i %256;
        }

        geom.attributes.voxidx = {itemsize:3, array:voxidx};
    },
    _makeMesh: function(geom, shader) {
        var mesh = new THREE.Mesh(geom, shader);
        mesh.doubleSided = true;
        mesh.position.y = -this.flatoff[1];
        var pivots = {back:new THREE.Object3D(), front:new THREE.Object3D()};
        pivots.back.add(mesh);
        pivots.front.add(pivots.back);
        pivots.back.position.y = geom.boundingBox.min.y - geom.boundingBox.max.y;
        pivots.front.position.y = geom.boundingBox.max.y - geom.boundingBox.min.y + this.flatoff[1];
        return {mesh:mesh, pivots:pivots};
    }, 
    _updateROIs: function() {
        this.roipack.update(this.renderer);
    }, 
}

function Dataset(nparray) {
    if (!(nparray instanceof NParray)) {
        nparray = NParray.fromJSON(nparray);
    }
    this.array = nparray;
    this.raw = nparray.data instanceof Uint8Array && nparray.shape.length > 1;
    this.textures = [];

    if ((this.raw && nparray.shape.length > 2) || (!this.raw && nparray.shape.length > 1)) {
        //Movie
        this.datasize = new THREE.Vector2(256, Math.ceil(nparray.shape[1] / 256));
        for (var i = 0; i < nparray.shape[0]; i++) {
            this.textures.push(Dataset.maketex(nparray, [this.datasize.x, this.datasize.y], this.raw, i));
        }
    } else {
        //Single frame
        this.datasize = new THREE.Vector2(256, Math.ceil(nparray.shape[0] / 256));
        this.textures.push(Dataset.maketex(nparray, [this.datasize.x, this.datasize.y], this.raw));
    }
    var minmax = nparray.minmax();
    this.min = minmax[0];
    this.max = minmax[1];
}
Dataset.maketex = function(array, shape, raw, slice) {
    var tex, data, form;
    var arr = slice === undefined ? array : array.view(slice);
    var size = array.shape[array.shape.length-1];
    var len = shape[0] * shape[1] * (raw ? size : 1);
    
    data = new array.data.constructor(len);
    data.set(arr.data);
    if (raw) {
        form = size == 4 ? THREE.RGBAFormat : THREE.RGBFormat;
        tex = new THREE.DataTexture(data, shape[0], shape[1], form, THREE.UnsignedByteType);
    } else {
        tex = new THREE.DataTexture(data, shape[0], shape[1], THREE.LuminanceFormat, THREE.FloatType);
    }
    tex.needsUpdate = true;
    tex.flipY = false;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    return tex;
}

function FacePick(viewer, callback) {
    this.viewer = viewer;
    this.pivot = {};
    this.meshes = {};
    this.idxrange = {};
    if (typeof(callback) == "function") {
        this.callback = callback;
    } else {
        this.callback = function(ptidx, idx) {
            console.log(ptidx, idx);
        }
    }

    this.scene = new THREE.Scene();
    this.shader = new THREE.ShaderMaterial({
        vertexShader: flatVertShade,
        fragmentShader: flatFragShade,
        attributes: { idx: true },
        morphTargets:true
    });

    this.camera = new THREE.PerspectiveCamera( 60, window.innerWidth / (window.innerHeight), 0.1, 5000 )
    this.camera.position = this.viewer.camera.position;
    this.camera.up.set(0,0,1);
    this.scene.add(this.camera);
    this.renderbuf = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter
    })
    this.height = window.innerHeight;

    var nface, nfaces = 0;
    for (var name in this.viewer.meshes) {
        var hemi = this.viewer.meshes[name];
        var morphs = [];
        for (var i = 0, il = hemi.geometry.morphTargets.length; i < il; i++) {
            morphs.push(hemi.geometry.morphTargets[i].array);
        }
        nface = hemi.geometry.attributes.flatindex.array.length / 3;
        this.idxrange[name] = [nfaces, nfaces + nface];

        var worker = new Worker("resources/js/mriview_worker.js");
        worker.onmessage = this.handleworker.bind(this);
        worker.postMessage({
            func:   "genFlatGeom",
            name:   name,
            ppts:   hemi.geometry.attributes.position.array,
            ppolys: hemi.geometry.attributes.flatindex.array,
            morphs: morphs,
            faceoff: nfaces,
        });
        nfaces += nface;
    }

    this._valid = false;
}
FacePick.prototype = {
    resize: function(w, h) {
        this.camera.aspect = w / h;
        this.height = h;
        delete this.renderbuf;
        this.renderbuf = new THREE.WebGLRenderTarget(w, h, {
            minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter
        })
    },

    draw: function(debug) {
        this.camera.lookAt(this.viewer.controls.target);
        for (var name in this.meshes) {
            this.pivot[name].front.rotation.z = this.viewer.pivot[name].front.rotation.z;
            this.pivot[name].back.rotation.z = this.viewer.pivot[name].back.rotation.z;
            this.meshes[name].morphTargetInfluences = this.viewer.meshes[name].morphTargetInfluences;
        }
        if (debug)
            this.viewer.renderer.render(this.scene, this.camera);
        else
            this.viewer.renderer.render(this.scene, this.camera, this.renderbuf);
    },

    handleworker: function(event) {
        var msg = event.data;
        var i, il, geom = new THREE.BufferGeometry();
        geom.attributes.position = {itemSize:3, array:msg.pts, stride:3};
        geom.attributes.index = {itemSize:1, array:msg.polys, stride:1};
        geom.attributes.idx = {itemSize:1, array:msg.color, stride:1};
        geom.morphTargets = [];
        for (i = 0, il = msg.morphs.length; i < il; i++) {
            geom.morphTargets.push({itemSize:3, array:msg.morphs[i], stride:3});
        }
        geom.offsets = []
        for (i = 0, il = msg.polys.length; i < il; i += 65535) {
            geom.offsets.push({start:i, index:i, count:Math.min(65535, il - i)});
        }
        geom.computeBoundingBox();
        var meshpiv = this.viewer._makeMesh(geom, this.shader);
        this.meshes[msg.name] = meshpiv.mesh;
        this.pivot[msg.name] = meshpiv.pivots;
        this.scene.add(meshpiv.pivots.front);
    }, 

    pick: function(x, y) {
        if (!this._valid)
            this.draw();
        var gl = this.viewer.renderer.context;
        var pix = new Uint8Array(4);
        var leftlen = this.viewer.meshes.left.geometry.attributes.position.array.length / 3;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.renderbuf.__webglFramebuffer);
        gl.readPixels(x, this.height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pix);
        var faceidx = (pix[0] << 16) + (pix[1] << 8) + pix[2];
        if (faceidx > 0) {
            //adjust for clicking on black area
            faceidx -= 1;
            for (var name in this.idxrange) {
                var lims = this.idxrange[name];
                if (lims[0] <= faceidx && faceidx < lims[1]) {
                    faceidx -= lims[0];
                    var polys = this.viewer.polys.flat[name].array;
                    var map = this.viewer.datamap[name];

                    var ptidx = polys[faceidx*3];
                    var dataidx = map[ptidx*2] + (map[ptidx*2+1] << 8);
                    ptidx += name == "right" ? leftlen : 0;

                    this.callback(ptidx, dataidx);
                }
            }
        } 
    }
}