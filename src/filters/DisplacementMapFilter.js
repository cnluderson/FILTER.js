/**
*
* Displacement Map Filter
*
* Displaces/Distorts the target image according to displace map
*
* @param displaceMap Optional (an Image used as a  dimaplcement map)
* @package FILTER.js
*
**/
!function(FILTER, undef){
    
    @@USE_STRICT@@
    
    var IMG = FILTER.ImArray, IMGcopy = FILTER.ImArrayCopy, 
        A16I = FILTER.Array16I,
        Min = Math.min, Max = Math.max, Floor = Math.floor
    ;
    
    //
    //
    // DisplacementMapFilter
    var DisplacementMapFilter = FILTER.DisplacementMapFilter = FILTER.Class( FILTER.Filter, {
        name: "DisplacementMapFilter"
        
        ,constructor: function( displacemap ) {
            if ( displacemap ) this.setMap( displacemap );
        }
        
        ,_map: null
        ,map: null
        // parameters
        ,scaleX: 1
        ,scaleY: 1
        ,startX: 0
        ,startY: 0
        ,componentX: 0
        ,componentY: 0
        ,color: 0
        ,red: 0
        ,green: 0
        ,blue: 0
        ,alpha: 0
        ,mode: FILTER.MODE.CLAMP
        
        ,dispose: function( ) {
            var self = this;
            
            self.disposeWorker( );
            
            self._map = null;
            self.map = null;
            self.scaleX = null;
            self.scaleY = null;
            self.startX = null;
            self.startY = null;
            self.componentX = null;
            self.componentY = null;
            self.color = null;
            self.red = null;
            self.green = null;
            self.blue = null;
            self.alpha = null;
            self.mode = null;
            
            return self;
        }
        
        ,serialize: function( ) {
            var self = this;
            return {
                filter: self.name
                
                ,params: {
                    _map: self._map
                    ,scaleX: self.scaleX
                    ,scaleY: self.scaleY
                    ,startX: self.startX
                    ,startY: self.startY
                    ,componentX: self.componentX
                    ,componentY: self.componentY
                    ,color: self.color
                    ,red: self.red
                    ,green: self.green
                    ,blue: self.blue
                    ,alpha: self.alpha
                    ,mode: self.mode
                }
            };
        }
        
        ,unserialize: function( json ) {
            var self = this, params;
            if ( json && self.name === json.filter )
            {
                params = json.params;
                
                self.map = null;
                self._map = params._map;
                self.scaleX = params.scaleX;
                self.scaleY = params.scaleY;
                self.startX = params.startX;
                self.startY = params.startY;
                self.componentX = params.componentX;
                self.componentY = params.componentY;
                self.color = params.color;
                self.red = params.red;
                self.green = params.green;
                self.blue = params.blue;
                self.alpha = params.alpha;
                self.mode = params.mode;
            }
            return self;
        }
        
        ,reset: function( ) {
            this._map = null; 
            this.map = null; 
            return this;
        }
        
        ,getMap: function( ) {
            return this.map;
        }
        
        ,setMap: function( map )  {
            if ( map )
            {
                this.map = map; 
                this._map = { data: map.getData( ), width: map.width, height: map.height }; 
            }
            return this;
        }
        
        ,setColor: function( c ) {
            this.color = c;
            this.alpha = (c >> 24) & 255; 
            this.red = (c >> 16) & 255; 
            this.green = (c >> 8) & 255; 
            this.blue = c & 255;
            return this;
        }
        
        // used for internal purposes
        ,_apply: function( im, w, h/*, image*/ ) {
            
            if ( !this._isOn || !this._map ) return im;
            
            var map, mapW, mapH, mapArea, displace, ww, hh,
                sx = this.scaleX*0.00390625, sy = this.scaleY*0.00390625, 
                comx = this.componentX, comy = this.componentY, 
                alpha = this.alpha, red = this.red, 
                green = this.green, blue = this.blue, mode = this.mode,
                sty, stx, styw, bx0, by0, bx, by,
                i, j, k, x, y, ty, ty2, yy, xx, mapOff, dstOff, srcOff,
                applyArea, imArea, imLen, imcopy, srcx, srcy,
                _Ignore = FILTER.MODE.IGNORE, _Clamp = FILTER.MODE.CLAMP, _Color = FILTER.MODE.COLOR, _Wrap = FILTER.MODE.WRAP
            ;
            
            map = this._map.data;
            mapW = this._map.width; mapH = this._map.height; 
            mapArea = (map.length>>2); ww = Min(mapW, w); hh = Min(mapH, h);
            imLen = im.length; applyArea = (ww*hh)<<2; imArea = (imLen>>2);
            
            // make start relative
            stx = Floor(this.startX*(w-1));
            sty = Floor(this.startY*(h-1));
            styw = sty*w;
            bx0 = -stx; by0 = -sty; bx = w-stx-1; by = h-sty-1;
            
            displace = new A16I(mapArea<<1);
            imcopy = new IMGcopy(im);
            
            // pre-compute indices, 
            // reduce redundant computations inside the main application loop (faster)
            // this is faster if mapArea <= imArea, else a reverse algorithm may be needed (todo)
            j=0; x=0; y=0; ty=0;
            for (i=0; i<mapArea; i++, j+=2, x++)
            { 
                if (x>=mapW) { x=0; y++; ty+=mapW; }
                mapOff = (x + ty)<<2;
                displace[j] = Floor( ( map[mapOff+comx] - 128 ) * sx ); 
                displace[j+1] = Floor( ( map[mapOff+comy] - 128 ) * sy );
            } 
            
            // apply filter (algorithm implemented directly based on filter definition, with some optimizations)
            x=0; y=0; ty=0; ty2=0;
            for (i=0; i<applyArea; i+=4, x++)
            {
                // update image coordinates
                if (x>=ww) { x=0; y++; ty+=w; ty2+=mapW; }
                
                // if inside the application area
                if (y<by0 || y>by || x<bx0 || x>bx) continue;
                
                xx = x + stx; yy = y + sty; dstOff = (xx + ty + styw)<<2;  
                
                j = (x + ty2)<<1; srcx = xx + displace[j];  srcy = yy + displace[j+1];
                
                if (srcy>=h || srcy<0 || srcx>=w || srcx<0)
                {
                    if (mode == _Ignore) 
                    {
                        continue;
                    }
                    
                    else if (mode == _Color)
                    {
                        im[dstOff] = red;  im[dstOff+1] = green;
                        im[dstOff+2] = blue;  im[dstOff+3] = alpha;
                        continue;
                    }
                        
                    else if (mode == _Wrap)
                    {
                        if (srcy>by) srcy-=h;
                        else if (srcy<0) srcy+=h;
                        if (srcx>bx) srcx-=w;
                        else if (srcx<0)  srcx+=w;
                    }
                        
                    else
                    {
                        if (srcy>by)  srcy=by;
                        else if (srcy<0) srcy=0;
                        if (srcx>bx) srcx=bx;
                        else if (srcx<0) srcx=0;
                    }
                }
                srcOff = (srcx + srcy*w)<<2;
                // new pixel values
                im[dstOff] = imcopy[srcOff];   im[dstOff+1] = imcopy[srcOff+1];
                im[dstOff+2] = imcopy[srcOff+2];  im[dstOff+3] = imcopy[srcOff+3];
            }
            return im;
        }
        
        ,apply: function( image, cb ) {
            if ( this._isOn && (this._map || this.map) )
            {
                var im = image.getSelectedData( );
                if ( this._worker )
                {
                    this
                        .bind( 'apply', function( data ) { 
                            this.unbind( 'apply' );
                            if ( data && data.im )
                                image.setSelectedData( data.im );
                            if ( cb ) cb.call( this );
                        })
                        // process request
                        .send( 'apply', {im: im, params: this.serialize( )} )
                    ;
                }
                else
                {
                    image.setSelectedData( this._apply( im[ 0 ], im[ 1 ], im[ 2 ], image ) );
                    if ( cb ) cb.call( this );
                }
            }
            return image;
        }
    });
    
}(FILTER);