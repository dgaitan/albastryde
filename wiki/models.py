# -*- coding: utf-8 -*-

import datetime
import markdown
from django.db import models
import djangosearch
from django.conf import settings
from wiki.albamarkup import albamarkup
import unicodedata
from django import forms  


class Imagen( models.Model ):
	nombre = models.CharField( max_length=100 )
	imagen = models.ImageField( upload_to="upload" )

	def __unicode__( self ):
        	return self.nombre

	class Meta:
		verbose_name_plural='imagenes'


class Pagina(models.Model):
	nombre = models.CharField(max_length=100,unique=True)
	contenido = models.TextField(blank=True)
	index = djangosearch.ModelIndex(text=['nombre','contenido'])
	imagenes = models.ManyToManyField( Imagen, blank=True )
	body_html = models.TextField(blank=True,editable=False)
	json_data = models.TextField(blank=True,editable=False)
	

	def __unicode__( self ):
        	return self.nombre

	def markdown_to_html( self ):
		markdownText= self.contenido
		images = self.imagenes.all()
    		image_ref_list = []
    		for image in images:
        		image_url = image.imagen.url
        		image_md = u"!["+image.nombre+"]("+str(image_url)+")" 
        		image_ref = u"!["+image.nombre +"]"
        		markdownText=markdownText.replace(image_ref,image_md)
    		albatranslator=albamarkup(markdownText)
    		markdownText = albatranslator.returntext
    		html = markdown.markdown( markdownText ).replace('[div','<div').replace('][/div]','></div>')
		self.json_data = albatranslator.json_data
		self.body_html = html
    		return True


        def save(self,force_insert=False,force_update=False):
		self.markdown_to_html()
		super(Pagina, self).save(force_insert,force_update)

